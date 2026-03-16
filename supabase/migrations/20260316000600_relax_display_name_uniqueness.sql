-- Migration: Relax Display Name Uniqueness
-- Allows properties to have generic duplicate names (e.g., 'Terreno Rural')
-- while keeping legacy_id unique for merging.

-- 1) Remove the strict total unique index on display_name
DROP INDEX IF EXISTS core_entities_tenant_display_name_unique;

-- 2) Create a regular index for performance (non-unique)
CREATE INDEX IF NOT EXISTS core_entities_tenant_display_name_idx
  ON public.core_entities(tenant_id, display_name);

-- 3) Ensure legacy_id remains unique (this is our primary merging key now)
-- (This should already exist from previous migration, but good to be sure)
CREATE UNIQUE INDEX IF NOT EXISTS core_entities_tenant_legacy_id_unique
  ON public.core_entities(tenant_id, legacy_id);
