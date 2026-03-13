-- Media Kit Module Tables

-- 1) media_kit_templates (Tamanhos das artes)
create table if not exists public.media_kit_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  width int not null,
  height int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists media_kit_templates_tenant_id_idx on public.media_kit_templates(tenant_id);

select public.byfrost_enable_rls('public.media_kit_templates'::regclass);
select public.byfrost_ensure_tenant_policies('public.media_kit_templates'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.media_kit_templates'::regclass, 'trg_media_kit_templates_set_updated_at');

-- 2) media_kits (As artes criadas)
create table if not exists public.media_kits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_id uuid references public.core_entities(id) on delete set null,
  name text not null,
  config jsonb not null default '{}'::jsonb, -- Editor state (layers, objects, etc.)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists media_kits_tenant_id_idx on public.media_kits(tenant_id);
create index if not exists media_kits_entity_id_idx on public.media_kits(entity_id);

select public.byfrost_enable_rls('public.media_kits'::regclass);
select public.byfrost_ensure_tenant_policies('public.media_kits'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.media_kits'::regclass, 'trg_media_kits_set_updated_at');

-- 3) Register route
do $$
begin
  if not exists (select 1 from public.route_registry where key = 'app.media_kit') then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.media_kit', 'Mídia Kit', 'Marketing', '/app/media-kit', 'Gerador de artes com base em entidades', true);
  end if;
end $$;

-- 4) Enable module for existing tenants
update public.tenants
   set modules_json = jsonb_set(
     coalesce(modules_json, '{}'::jsonb),
     '{media_kit_enabled}',
     'true'::jsonb,
     true
   )
 where (modules_json -> 'media_kit_enabled') is null
   and deleted_at is null;
