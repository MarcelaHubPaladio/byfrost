-- Migration: Robust Unique Indexes for Imports
-- replacing partial indexes with total ones for PostgREST compatibility

-- 1) Legacy ID
DROP INDEX IF EXISTS core_entities_tenant_legacy_id_uq;
CREATE UNIQUE INDEX IF NOT EXISTS core_entities_tenant_legacy_id_unique
  ON public.core_entities(tenant_id, legacy_id);

-- 2) Display Name 
-- Ensure a total unique index exists for (tenant_id, display_name)
-- (Drops any partial ones that might conflict with PostgREST ON CONFLICT)
DROP INDEX IF EXISTS core_entities_tenant_display_name_uq_idx;
DROP INDEX IF EXISTS core_entities_tenant_display_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS core_entities_tenant_display_name_unique
  ON public.core_entities(tenant_id, display_name);
