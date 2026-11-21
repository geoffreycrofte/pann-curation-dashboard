-- Replies of the engagement tool (2026-11-21).
-- 1. A reply drafted by the AI, on request, for a conversation the person wants to answer.
--    Pann never posts it: the person copies, adapts and posts it themself.
-- 2. "Mark as replied": a conversation to reply to (validated) becomes replied (published),
--    and can go back. replied_at dates it, for the weekly limit per community.
-- Status transitions are kept in sync with packages/shared/src/status.ts.

alter table public.item_topics
  add column replied_at timestamptz,
  add column reply_draft text check (char_length(reply_draft) <= 4000),
  add column reply_status text not null default 'none'
    check (reply_status in ('none', 'pending', 'ready', 'failed')),
  add column reply_error text;

-- The person edits the drafted reply; the rest is written by the job.
grant update (reply_draft) on public.item_topics to authenticated;

create or replace function private.check_item_topic_transition()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = old.status or current_user <> 'authenticated' then
    return new;
  end if;

  if not (
       (old.status = 'new'       and new.status in ('validated', 'rejected', 'archived'))
    or (old.status = 'validated' and new.status in ('new', 'rejected'))
    or (old.status = 'archived'  and new.status in ('new', 'validated', 'rejected'))
    or (old.status = 'rejected'  and new.status in ('new', 'validated'))
    -- Conversations: the person replied themself, or takes it back.
    or (new.module = 'engagement' and old.status = 'validated' and new.status = 'published')
    or (new.module = 'engagement' and old.status = 'published' and new.status = 'validated')
  ) then
    raise exception 'Transition % -> % is not allowed', old.status, new.status
      using errcode = 'check_violation';
  end if;

  new.validated_at := case
    when new.status = 'validated' then now()
    when new.status = 'published' then old.validated_at
    else null
  end;
  new.replied_at := case when new.status = 'published' then now() else null end;
  return new;
end;
$$;

-- Asked from the board: checks access (RLS helper), then marks the draft as pending; the
-- API queues the job right after.
create function public.request_reply_draft(p_topic_id uuid, p_item_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_access_topic(p_topic_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.item_topics
  set reply_status = 'pending', reply_error = null
  where topic_id = p_topic_id and item_id = p_item_id
    and module = 'engagement'
    and status in ('new', 'validated');
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.request_reply_draft(uuid, uuid) from public, anon;
grant execute on function public.request_reply_draft(uuid, uuid) to authenticated;
