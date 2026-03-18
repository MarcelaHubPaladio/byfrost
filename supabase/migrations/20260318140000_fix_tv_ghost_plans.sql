-- Migration: Fix TV Corporativa Ghost Plans
-- Author: Antigravity
-- Date: 2026-03-18

-- 1) Create a function to soft-delete dependent entity plans
create or replace function public.handle_tv_plan_soft_delete()
returns trigger
language plpgsql
security definer
as $$
begin
  -- If deleted_at was null and is now set, cascade the soft-delete
  if (old.deleted_at is null and new.deleted_at is not null) then
    update public.tv_entity_plans
       set deleted_at = new.deleted_at,
           is_active = false
     where plan_id = new.id
       and deleted_at is null;
  end if;
  return new;
end;
$$;

-- 2) Attach the trigger to tv_plans
drop trigger if exists trg_handle_tv_plan_soft_delete on public.tv_plans;
create trigger trg_handle_tv_plan_soft_delete
  after update of deleted_at on public.tv_plans
  for each row
  execute function public.handle_tv_plan_soft_delete();

-- 3) Clean up existing ghost records
-- Soft-delete any tv_entity_plans that point to an already soft-deleted tv_plan
update public.tv_entity_plans ep
   set deleted_at = p.deleted_at,
       is_active = false
  from public.tv_plans p
 where ep.plan_id = p.id
   and p.deleted_at is not null
   and ep.deleted_at is null;
