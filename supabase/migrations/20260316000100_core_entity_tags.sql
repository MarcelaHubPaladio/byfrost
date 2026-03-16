-- BYFROST — TAGS GLOBAIS PARA ENTIDADES
-- 
-- Cria tabela de tags para entidades core, seguindo o padrão de 'case_tags'.

create table if not exists public.core_entity_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_id uuid not null,
  tag text not null,
  created_at timestamptz not null default now(),
  constraint core_entity_tags_entity_fk
    foreign key (tenant_id, entity_id)
    references public.core_entities(tenant_id, id)
    on delete cascade,
  constraint core_entity_tags_unique_uq
    unique (tenant_id, entity_id, tag)
);

create index if not exists core_entity_tags_entity_idx
  on public.core_entity_tags(tenant_id, entity_id);

create index if not exists core_entity_tags_tag_idx
  on public.core_entity_tags(tenant_id, tag);

select public.byfrost_enable_rls('public.core_entity_tags'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_entity_tags'::regclass, 'tenant_id');
