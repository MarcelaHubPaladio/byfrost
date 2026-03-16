-- Migration: Robust Photos and Room Types
-- 1) Ensure Room Types table exists (Fixes 404)
CREATE TABLE IF NOT EXISTS public.core_property_room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS core_property_room_types_name_tenant_unique 
  ON public.core_property_room_types(tenant_id, name) 
  WHERE deleted_at IS NULL;

SELECT public.byfrost_enable_rls('public.core_property_room_types'::regclass);
SELECT public.byfrost_ensure_tenant_policies('public.core_property_room_types'::regclass, 'tenant_id');
SELECT public.byfrost_ensure_updated_at_trigger('public.core_property_room_types'::regclass, 'trg_core_property_room_types_set_updated_at');

-- Populate defaults
CREATE OR REPLACE FUNCTION public.populate_default_room_types(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.core_property_room_types (tenant_id, name, is_default)
  VALUES 
    (p_tenant_id, 'Geral', true),
    (p_tenant_id, 'Sala', true),
    (p_tenant_id, 'Cozinha', true),
    (p_tenant_id, 'Quarto', true),
    (p_tenant_id, 'Banheiro', true),
    (p_tenant_id, 'Fachada', true)
  ON CONFLICT (tenant_id, name) WHERE deleted_at IS NULL DO NOTHING;
END;
$$;

SELECT public.populate_default_room_types(id) FROM public.tenants;

-- 2) Deduplicate Photos (Fixes duplication during re-imports)
-- Create a total unique index on (entity_id, url) to allow PostgREST ON CONFLICT
DROP INDEX IF EXISTS core_entity_photos_url_entity_unique;
CREATE UNIQUE INDEX IF NOT EXISTS core_entity_photos_url_entity_unique
  ON public.core_entity_photos(entity_id, url);

-- Cleanup previous duplicates (Keep only the newest one per entity+url)
DELETE FROM public.core_entity_photos a
USING public.core_entity_photos b
WHERE a.id < b.id 
  AND a.entity_id = b.entity_id 
  AND a.url = b.url;
