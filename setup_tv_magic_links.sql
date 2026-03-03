-- Facilitated Entity Login (Magic Link) for TV Corporativa

-- 1. Add magic_token to core_entities
alter table public.core_entities add column if not exists magic_token text unique;

-- 2. Create RPC to fetch entity data and its media via token
-- This security definer function allows public access to a specific entity's TV media 
-- without full authentication, provided they have the magic token.
create or replace function public.public_get_tv_entity_data(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity record;
  v_tenant record;
  v_media jsonb;
  v_plans jsonb;
begin
  -- Find the entity by magic token
  select e.id, e.tenant_id, e.display_name, e.entity_type
    into v_entity
    from public.core_entities e
   where e.magic_token = p_token
     and e.deleted_at is null;

  if v_entity.id is null then
    return jsonb_build_object('valid', false, 'reason', 'invalid_token');
  end if;

  -- Get tenant info
  select t.name, t.slug
    into v_tenant
    from public.tenants t
   where t.id = v_entity.tenant_id;

  -- Get current media for this entity
  select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
    into v_media
    from public.tv_media m
   where m.entity_id = v_entity.id
     and m.tenant_id = v_entity.tenant_id
     and m.deleted_at is null
     and m.status = 'active';

  -- Get active plans for this entity
  -- This helps the frontend know which plan is active (and thus its duration)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ep.id,
      'plan_id', ep.plan_id,
      'plan_name', p.name,
      'is_active', ep.is_active
    )), '[]'::jsonb)
    into v_plans
    from public.tv_entity_plans ep
    join public.tv_plans p on ep.plan_id = p.id
   where ep.entity_id = v_entity.id
     and ep.is_active = true
     and ep.deleted_at is null;

  return jsonb_build_object(
    'valid', true,
    'entity_id', v_entity.id,
    'tenant_id', v_entity.tenant_id,
    'entity_name', v_entity.display_name,
    'tenant_name', v_tenant.name,
    'media', v_media,
    'active_plans', v_plans
  );
end;
$$;

-- 3. RPC to add media via token
create or replace function public.public_add_tv_media_via_token(
  p_token text,
  p_media_type text,
  p_url text,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
  v_tenant_id uuid;
begin
  select id, tenant_id into v_entity_id, v_tenant_id
    from public.core_entities
   where magic_token = p_token
     and deleted_at is null;

  if v_entity_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
  end if;

  insert into public.tv_media (tenant_id, entity_id, media_type, url, name)
  values (v_tenant_id, v_entity_id, p_media_type, p_url, p_name);

  return jsonb_build_object('success', true);
end;
$$;

-- 4. RPC to delete media via token (soft delete)
create or replace function public.public_delete_tv_media_via_token(
  p_token text,
  p_media_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
begin
  select id into v_entity_id
    from public.core_entities
   where magic_token = p_token
     and deleted_at is null;

  if v_entity_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
  end if;

  update public.tv_media
     set deleted_at = now()
   where id = p_media_id
     and entity_id = v_entity_id;

  return jsonb_build_object('success', true);
end;
$$;

-- Grant access to public
grant execute on function public.public_get_tv_entity_data(text) to anon, authenticated, service_role;
grant execute on function public.public_add_tv_media_via_token(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.public_delete_tv_media_via_token(text, uuid) to anon, authenticated, service_role;
