-- BYFROST — Chat Notifications Support
-- Implements unread message tracking for the communication module.

-- 1. Add last_read_at to communication_members
alter table public.communication_members 
add column if not exists last_read_at timestamptz not null default now();

-- 2. Function to mark a channel as read
create or replace function public.mark_channel_as_read(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.communication_members (channel_id, user_id, last_read_at)
    values (p_channel_id, auth.uid(), now())
    on conflict (channel_id, user_id) 
    do update set last_read_at = now();
end;
$$;

-- 3. Function to get unread count for the current user in a tenant
create or replace function public.get_unread_communication_count(p_tenant_id uuid)
returns bigint
language plpgsql
security definer
stable
set search_path = public
as $$
declare
    v_count bigint;
begin
    select count(*)
    into v_count
    from public.communication_messages m
    join public.communication_channels c on c.id = m.channel_id
    left join public.communication_members mem on mem.channel_id = c.id and mem.user_id = auth.uid()
    where c.tenant_id = p_tenant_id
      and c.deleted_at is null
      and m.deleted_at is null
      and m.user_id != auth.uid()
      and (
        -- For public/group channels, counting since last_read_at or ignoring if never read?
        -- To avoid notifying for old messages, we assume "never read" = "read everything until now" 
        -- but only from the moment the user has access.
        -- For simplicity: created_at > coalesce(mem.last_read_at, 'epoch')
        -- But to avoid "ghost" notifications of 1000 messages on first access,
        -- we could limit it or rely on the user having read it once.
        m.created_at > coalesce(mem.last_read_at, '2020-01-01'::timestamptz)
      )
      and (
        c.type = 'group' or 
        exists (select 1 from public.communication_members cm where cm.channel_id = c.id and cm.user_id = auth.uid())
      );
      
    return v_count;
end;
$$;
-- Ensure RLS allows selecting members for the RPC (it already does for self)

-- 4. Add last_message_at to communication_channels for UI optimization
alter table public.communication_channels 
add column if not exists last_message_at timestamptz not null default now();

-- 5. Trigger to update last_message_at on new message
create or replace function public.handle_communication_message_insert_for_channel()
returns trigger
language plpgsql
security definer
as $$
begin
    update public.communication_channels 
    set last_message_at = new.created_at
    where id = new.channel_id;
    return new;
end;
$$;

create trigger on_communication_message_inserted_update_channel
    after insert on public.communication_messages
    for each row execute procedure public.handle_communication_message_insert_for_channel();

-- Ensure RLS allows selecting members for the RPC (it already does for self)
