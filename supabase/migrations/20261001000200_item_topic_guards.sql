-- Pann: enforce curation rules in the database, not only in the API.
-- The publishable key is public, so a user could call PostgREST directly.

-- Users may only change the status columns; scores etc. are written by jobs.
revoke update on public.item_topics from authenticated;
grant update (status, validated_at) on public.item_topics to authenticated;

-- Same transition table as packages/shared/src/status.ts (keep both in sync).
-- Jobs (service role) are not restricted: they publish, and re-open updated tools.
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
  ) then
    raise exception 'Transition % -> % is not allowed', old.status, new.status
      using errcode = 'check_violation';
  end if;

  new.validated_at := case when new.status = 'validated' then now() else null end;
  return new;
end;
$$;

create trigger item_topics_transition
  before update of status on public.item_topics
  for each row execute function private.check_item_topic_transition();
