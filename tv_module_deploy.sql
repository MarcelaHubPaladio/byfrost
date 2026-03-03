-- Migration: Relax customer_accounts RLS and fix sync triggers
-- Description: Allows tenant users to manage leads and ensures sync triggers have adequate permissions.

-- 1. Fix helper functions to be SECURITY DEFINER
-- This prevents circular dependencies/recursion when users_profile also has RLS.

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'byfrost_super_admin')::boolean,
    (auth.jwt() -> 'app_metadata' ->> 'super_admin')::boolean,
    false
  );
$$;

create or replace function public.has_tenant_access(tid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.users_profile up
      where up.user_id = auth.uid()
        and up.tenant_id = tid
        and up.deleted_at is null
    );
$$;

-- 2. Relax customer_accounts RLS
drop policy if exists customer_accounts_select on public.customer_accounts;
drop policy if exists customer_accounts_write on public.customer_accounts;
drop policy if exists customer_accounts_insert on public.customer_accounts;
drop policy if exists customer_accounts_update on public.customer_accounts;
drop policy if exists customer_accounts_delete on public.customer_accounts;

-- SELECT: Anyone with tenant access
create policy customer_accounts_select on public.customer_accounts
for select to authenticated
using (public.has_tenant_access(tenant_id));

-- INSERT: Anyone with tenant access
create policy customer_accounts_insert on public.customer_accounts
for insert to authenticated
with check (public.has_tenant_access(tenant_id));

-- UPDATE: Anyone with tenant access
create policy customer_accounts_update on public.customer_accounts
for update to authenticated
using (public.has_tenant_access(tenant_id))
with check (public.has_tenant_access(tenant_id));

-- DELETE: Super Admin or Tenant Admin (safer)
create policy customer_accounts_delete on public.customer_accounts
for delete to authenticated
using (
    public.is_super_admin()
    or exists (
        select 1 from public.users_profile up
        where up.user_id = auth.uid()
          and up.tenant_id = customer_accounts.tenant_id
          and up.role = 'admin'
    )
);

-- 3. Make CRM bridge triggers SECURITY DEFINER
-- This ensures that when a user creates a customer_account, the trigger can sync to core_entities
-- even if the user doesn't have direct broad permissions on core tables.
-- ... [Rest of the file remains same]

create or replace function public.crm_customer_accounts_ensure_entity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
  v_name text;
  v_phone_digits text;
begin
  if new.entity_id is null then
    v_entity_id := gen_random_uuid();
    v_name := coalesce(nullif(trim(new.name), ''), nullif(trim(new.phone_e164), ''), 'Cliente');
    v_phone_digits := nullif(public.crm_digits_only(new.phone_e164), '');

    insert into public.core_entities(
      id,
      tenant_id,
      entity_type,
      subtype,
      display_name,
      status,
      metadata
    ) values (
      v_entity_id,
      new.tenant_id,
      'party',
      'cliente',
      v_name,
      'active',
      jsonb_strip_nulls(
        jsonb_build_object(
          'source', 'crm_customer_accounts',
          'source_customer_account_id', new.id,
          'cpf_cnpj', nullif(public.crm_digits_only(new.cpf), ''),
          'whatsapp', v_phone_digits,
          'email', nullif(trim(new.email), '')
        )
      )
    );

    new.entity_id := v_entity_id;
    return new;
  end if;

  update public.core_entities e
     set display_name = coalesce(nullif(trim(new.name), ''), e.display_name),
         subtype = coalesce(e.subtype, 'cliente'),
         status = coalesce(e.status, 'active'),
         metadata = jsonb_strip_nulls(
           coalesce(e.metadata, '{}'::jsonb) ||
           jsonb_build_object(
             'source', 'crm_customer_accounts',
             'source_customer_account_id', new.id,
             'cpf_cnpj', nullif(public.crm_digits_only(new.cpf), ''),
             'whatsapp', nullif(public.crm_digits_only(new.phone_e164), ''),
             'email', nullif(trim(new.email), '')
           )
         )
   where e.tenant_id = new.tenant_id
     and e.id = new.entity_id
     and e.deleted_at is null;

  return new;
end;
$$;

create or replace function public.crm_cases_sync_customer_entity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
begin
  if new.customer_id is null then
    new.customer_entity_id := null;
    return new;
  end if;

  if new.customer_entity_id is not null then
    return new;
  end if;

  select ca.entity_id
    into v_entity_id
    from public.customer_accounts ca
   where ca.tenant_id = new.tenant_id
     and ca.id = new.customer_id
     and ca.deleted_at is null;

  new.customer_entity_id := v_entity_id;
  return new;
end;
$$;

create or replace function public.crm_case_items_ensure_offering_entity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_display text;
  v_entity_id uuid;
begin
  if new.tenant_id is null and new.case_id is not null then
    select c.tenant_id into new.tenant_id
      from public.cases c
     where c.id = new.case_id;
  end if;

  if new.tenant_id is null then
    return new;
  end if;

  if new.offering_entity_id is not null then
    return new;
  end if;

  v_display := trim(coalesce(new.description, ''));
  if v_display = '' then
    return new;
  end if;

  v_norm := public.crm_normalize_name(v_display);

  select m.offering_entity_id
    into v_entity_id
    from public.crm_offering_map m
   where m.tenant_id = new.tenant_id
     and m.normalized_name = v_norm
     and m.deleted_at is null
   limit 1;

  if v_entity_id is null then
    v_entity_id := gen_random_uuid();

    insert into public.core_entities(
      id,
      tenant_id,
      entity_type,
      subtype,
      display_name,
      status,
      metadata
    ) values (
      v_entity_id,
      new.tenant_id,
      'offering',
      'servico',
      v_display,
      'active',
      jsonb_build_object('source', 'crm_case_items', 'normalized_name', v_norm)
    );

    insert into public.crm_offering_map(tenant_id, normalized_name, offering_entity_id)
    values (new.tenant_id, v_norm, v_entity_id)
    on conflict (tenant_id, normalized_name) do nothing;

    select m.offering_entity_id
      into v_entity_id
      from public.crm_offering_map m
     where m.tenant_id = new.tenant_id
       and m.normalized_name = v_norm
       and m.deleted_at is null
     limit 1;
  end if;

  new.offering_entity_id := v_entity_id;
  return new;
end;
$$;
-- TV Corporativa Module Tables

-- 1) tv_points
create table if not exists public.tv_points (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tv_points_tenant_id_idx on public.tv_points(tenant_id);

select public.byfrost_enable_rls('public.tv_points'::regclass);
select public.byfrost_ensure_tenant_policies('public.tv_points'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.tv_points'::regclass, 'trg_tv_points_set_updated_at');

-- 2) tv_plans
create table if not exists public.tv_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  impression_rules jsonb default '{}'::jsonb,
  video_duration_seconds int not null default 15,
  has_contact_break boolean not null default false,
  contact_break_layout jsonb default '{}'::jsonb,
  frame_layout jsonb default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tv_plans_tenant_id_idx on public.tv_plans(tenant_id);

select public.byfrost_enable_rls('public.tv_plans'::regclass);
select public.byfrost_ensure_tenant_policies('public.tv_plans'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.tv_plans'::regclass, 'trg_tv_plans_set_updated_at');

-- 3) tv_entity_plans
create table if not exists public.tv_entity_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_id uuid not null references public.core_entities(id) on delete cascade,
  plan_id uuid not null references public.tv_plans(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tv_entity_plans_tenant_id_idx on public.tv_entity_plans(tenant_id);
create index if not exists tv_entity_plans_entity_id_idx on public.tv_entity_plans(entity_id);
create index if not exists tv_entity_plans_plan_id_idx on public.tv_entity_plans(plan_id);
create unique index if not exists tv_entity_plans_tenant_entity_active_uq on public.tv_entity_plans(tenant_id, entity_id) where deleted_at is null;

select public.byfrost_enable_rls('public.tv_entity_plans'::regclass);
select public.byfrost_ensure_tenant_policies('public.tv_entity_plans'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.tv_entity_plans'::regclass, 'trg_tv_entity_plans_set_updated_at');

-- 4) tv_media
create table if not exists public.tv_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_id uuid not null references public.core_entities(id) on delete cascade,
  media_type text not null check (media_type in ('supabase_storage', 'youtube_link', 'google_drive_link')),
  url text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tv_media_tenant_id_idx on public.tv_media(tenant_id);
create index if not exists tv_media_entity_id_idx on public.tv_media(entity_id);

select public.byfrost_enable_rls('public.tv_media'::regclass);
select public.byfrost_ensure_tenant_policies('public.tv_media'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.tv_media'::regclass, 'trg_tv_media_set_updated_at');


-- 5) tv_timelines
create table if not exists public.tv_timelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tv_point_id uuid not null references public.tv_points(id) on delete cascade,
  mode text not null check (mode in ('manual', 'automatic')) default 'automatic',
  manual_order jsonb default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tv_timelines_tv_point_uq unique (tv_point_id)
);

create index if not exists tv_timelines_tenant_id_idx on public.tv_timelines(tenant_id);

select public.byfrost_enable_rls('public.tv_timelines'::regclass);
select public.byfrost_ensure_tenant_policies('public.tv_timelines'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.tv_timelines'::regclass, 'trg_tv_timelines_set_updated_at');

-- Create storage bucket for TV Corporativa
do $$
begin
    if not exists (select 1 from storage.buckets where id = 'tv-corporativa-media') then
      insert into storage.buckets (id, name, public)
      values ('tv-corporativa-media', 'tv-corporativa-media', true);
    end if;
end $$;

-- Allow public access for viewing
DO $do$
begin
  if not exists (
    select 1 from pg_policies where policyname='Public Access TV Media' and tablename='objects' and schemaname='storage'
  ) then
    create policy "Public Access TV Media"
    on storage.objects for select
    using ( bucket_id = 'tv-corporativa-media' );
  end if;
end $do$;

-- Allow authenticated users to upload
DO $do$
begin
  if not exists (
    select 1 from pg_policies where policyname='Authenticated Upload TV Media' and tablename='objects' and schemaname='storage'
  ) then
    create policy "Authenticated Upload TV Media"
    on storage.objects for insert
    with check ( bucket_id = 'tv-corporativa-media' and auth.role() = 'authenticated' );
  end if;
end $do$;
-- Register TV Corporativa UI Route
DO $$
begin
  insert into public.route_registry(key, name, category, path_pattern, description, is_system)
  values ('app.tv_corporativa', 'TV Corporativa', 'Tenant', '/app/tv-corporativa', 'Gestão de Pontos, Planos e Mídia da TV Corporativa', true)
  on conflict (key) do nothing;
end $$;

DO $$
declare
  r_app_tv text := 'app.tv_corporativa';
  v_role_id uuid;
  v_tenant_id uuid;
  v_role_key text;
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema='public' and table_name='tenant_route_permissions'
  ) then
    return;
  end if;

  for v_tenant_id in (select id from public.tenants where deleted_at is null) loop
    for v_role_id, v_role_key in 
      select tr.role_id, r.key 
      from public.tenant_roles tr 
      join public.roles r on r.id = tr.role_id 
      where tr.tenant_id = v_tenant_id 
        and tr.enabled = true
    loop
      -- Only admin and manager by default
      if v_role_key in ('admin','manager') then
        insert into public.tenant_route_permissions(tenant_id, role_id, route_key, allowed)
        values (v_tenant_id, v_role_id, r_app_tv, true)
        on conflict (tenant_id, role_id, route_key)
        do update set allowed = excluded.allowed;
      end if;
    end loop;
  end loop;
end $$;
