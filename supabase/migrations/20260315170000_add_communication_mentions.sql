-- Migration: Add Communication Mentions
-- Date: 2026-03-15

-- 1. Tables
create table if not exists public.communication_mentions (
    id uuid primary key default gen_random_uuid(),
    message_id uuid not null references public.communication_messages(id) on delete cascade,
    user_id uuid not null,
    created_at timestamptz not null default now()
);

-- 2. RLS & Policies
alter table public.communication_mentions enable row level security;

create policy communication_mentions_select on public.communication_mentions
    for select to authenticated
    using (
        user_id = auth.uid() or 
        exists (
            select 1 from public.communication_messages m
            join public.communication_channels c on c.id = m.channel_id
            where m.id = message_id and (
                c.type = 'group' or 
                exists (
                    select 1 from public.communication_members cm 
                    where cm.channel_id = c.id and cm.user_id = auth.uid()
                )
            )
        )
    );

create policy communication_mentions_insert on public.communication_mentions
    for insert to authenticated
    with check (
        exists (
            select 1 from public.communication_messages m
            where m.id = message_id and m.user_id = auth.uid()
        )
    );

-- 3. Indexes
create index idx_comm_mentions_user_id on public.communication_mentions(user_id);
create index idx_comm_mentions_message_id on public.communication_mentions(message_id);

-- 4. Realtime
alter publication supabase_realtime add table public.communication_mentions;
