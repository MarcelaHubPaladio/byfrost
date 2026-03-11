-- Migration: unique index for core_entities to support bulk upsert by name
-- Description: Adds a partial unique index on (tenant_id, display_name) for active entities.

-- 1. Deduplicate existing entities before creating the unique index
-- This keeps the most recently updated record for each (tenant_id, display_name)
-- We must temporarily disable the "immutable" trigger on events because entities have cascade delete to events.
alter table public.core_entity_events disable trigger trg_core_entity_events_no_delete;

delete from public.core_entities e1
 where e1.id not in (
   select distinct on (tenant_id, display_name) id
     from public.core_entities
    order by tenant_id, display_name, updated_at desc
 );

alter table public.core_entity_events enable trigger trg_core_entity_events_no_delete;

-- 2. Create a total unique index (PostgREST UPSERT requires a non-partial unique constraint)
drop index if exists core_entities_tenant_display_name_unique_active;
drop index if exists core_entities_tenant_display_name_unique;
create unique index if not exists core_entities_tenant_display_name_unique
  on public.core_entities(tenant_id, display_name);
