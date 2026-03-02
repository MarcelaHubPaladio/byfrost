-- Migration: Add created_by_user_id and allow creators to view cases (RLS)
-- Description: Enables users to view cases they created, even if unassigned or hierarchical.

-- 1. Add created_by_user_id column with DEFAULT to ensure it's always set
alter table public.cases
add column if not exists created_by_user_id uuid references auth.users(id) on delete set null default auth.uid();

-- Ensure existing rows are NOT affected, but new ones are guaranteed to have it
-- even if the frontend doesn't send it yet.

-- 2. Update cases_select policy to include creator
-- We replace the policy created in 20260302040000_hierarchy_and_start_route.sql
drop policy if exists cases_select on public.cases;

create policy cases_select on public.cases
for select to authenticated
using (
    public.is_super_admin() 
    or (
        public.has_tenant_access(tenant_id)
        and (
            -- Assigned to me
            assigned_user_id = auth.uid()
            -- OR Created by me
            or created_by_user_id = auth.uid()
            -- OR I am an admin in this tenant
            or exists (
                select 1 from public.users_profile up 
                where up.user_id = auth.uid() 
                  and up.tenant_id = cases.tenant_id 
                  and up.role = 'admin'
            )
            -- OR The assignee is one of my subordinates
            or (assigned_user_id in (select public.get_subordinates(tenant_id, auth.uid())))
        )
    )
);

-- 3. Update cases_insert policy to ensure created_by_user_id is handled
-- We already have a broad insert policy in 0001_byfrost_init.sql, 
-- but we can add an extra one or replace it to be sure.
-- For now, the set default auth.uid() is the most powerful fix.

-- 4. Safety trigger to ensure created_by_user_id is set to the current user on insert
-- This is a fallback if the default doesn't trigger for some reason (e.g. explicitly sending NULL).
create or replace function public.ensure_case_created_by()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.created_by_user_id is null then
    new.created_by_user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_case_created_by on public.cases;
create trigger trg_ensure_case_created_by
before insert on public.cases
for each row execute function public.ensure_case_created_by();
