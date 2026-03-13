-- Migration: Add Masks to Media Kit module

-- 1) media_kit_masks
create table if not exists public.media_kit_masks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  config jsonb not null default '{"layouts": {}}'::jsonb, -- Store layers mapped by template_id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists media_kit_masks_tenant_id_idx on public.media_kit_masks(tenant_id);

select public.byfrost_enable_rls('public.media_kit_masks'::regclass);
select public.byfrost_ensure_tenant_policies('public.media_kit_masks'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.media_kit_masks'::regclass, 'trg_media_kit_masks_set_updated_at');

-- 2) Update media_kits to ensure entity_id is not strictly required in the UI (already true in schema)
-- No changes needed to schema as entity_id is already nullable.
