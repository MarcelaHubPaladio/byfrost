-- Migration: unique index for core_entities to support bulk upsert by name
-- Description: Adds a partial unique index on (tenant_id, display_name) for active entities.

create unique index if not exists core_entities_tenant_display_name_unique_active
  on public.core_entities(tenant_id, display_name)
  where deleted_at is null;
