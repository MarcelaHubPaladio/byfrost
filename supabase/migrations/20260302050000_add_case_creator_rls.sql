-- Migration: Add created_by_user_id and allow creators to view cases (RLS)
-- Description: Enables users to view cases they created, even if unassigned or hierarchical.

-- 1. Add created_by_user_id column to cases
alter table public.cases
add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

-- 2. Update cases_select policy to include creator
-- We replace the policy created in 20260302040000_hierarchy_and_start_route.sql
drop policy if exists cases_select on public.cases;

create policy cases_select on public.cases
for select to authenticated
using (
    public.is_super_admin() 
    or (
        public.has_tenant_access(tenant_id)
        and (
            -- Assigned to me
            assigned_user_id = auth.uid()
            -- OR Created by me
            or created_by_user_id = auth.uid()
            -- OR I am an admin in this tenant
            or exists (
                select 1 from public.users_profile up 
                where up.user_id = auth.uid() 
                  and up.tenant_id = cases.tenant_id 
                  and up.role = 'admin'
            )
            -- OR The assignee is one of my subordinates
            or (assigned_user_id in (select public.get_subordinates(tenant_id, auth.uid())))
        )
    )
);

-- 3. Update cases_insert policy to ensure created_by_user_id is handled (standard checks)
-- The existing policy already covers has_tenant_access(tenant_id).
-- We don't necessarily need to CHANGE it unless we want to FORCE created_by_user_id = auth.uid().
-- But for now, just making it available is enough for the frontend to fill.
