-- Migration: Unify RLS Helpers to Eliminate Recursion (FIXED SYNTAX)
-- Description: Consolidates all security helpers in plpgsql to break loops in tenants, cases and profiles.

-- 1. Consolidated Security Helpers (all as plpgsql + security definer)

create or replace function public.is_super_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  return coalesce((auth.jwt() -> 'app_metadata' ->> 'byfrost_super_admin')::boolean, false);
end;
$$;

create or replace function public.has_tenant_access(tid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if public.is_super_admin() then
    return true;
  end if;

  return exists (
    select 1
    from public.users_profile up
    where up.user_id = auth.uid()
      and up.tenant_id = tid
      and up.deleted_at is null
  );
end;
$$;

create or replace function public.is_tenant_admin(tid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  return exists (
    select 1 from public.users_profile up 
    where up.user_id = auth.uid() 
      and up.tenant_id = tid 
      and up.role = 'admin'
      and up.deleted_at is null
  );
end;
$$;

create or replace function public.get_subordinates(p_tenant_id uuid, p_user_id uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    return query
    with recursive subs as (
        select user_id
        from public.org_nodes
        where tenant_id = p_tenant_id and parent_user_id = p_user_id
        union
        select o.user_id
        from public.org_nodes o
        join subs s on o.parent_user_id = s.user_id
        where o.tenant_id = p_tenant_id
    )
    select user_id from subs;
end;
$$;

-- 2. Update Tenants RLS (replace manual exists)
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
for select to authenticated
using (public.has_tenant_access(id));

-- 3. Update Users Profile RLS (Simplified + Break loop)
drop policy if exists users_profile_select on public.users_profile;
create policy users_profile_select on public.users_profile
for select to authenticated
using (
    -- I can always see my OWN profile across any tenant (No function call = No recursion)
    (user_id = auth.uid())
    -- For others, use the protected helper
    or public.is_super_admin()
    or public.has_tenant_access(tenant_id)
);

-- 4. Update Cases RLS (Simplified Syntax - removed dynamic format)
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases
for select to authenticated
using (
    public.is_super_admin() 
    or (
        public.has_tenant_access(tenant_id)
        and (
            assigned_user_id = auth.uid()
            -- We confirmed this column exists in migration 20260302050000_add_case_creator_rls.sql
            or created_by_user_id = auth.uid()
            -- OR I am an admin in this tenant
            or public.is_tenant_admin(tenant_id)
            -- OR The assignee is one of my subordinates
            or (assigned_user_id in (select public.get_subordinates(tenant_id, auth.uid())))
        )
    )
);
