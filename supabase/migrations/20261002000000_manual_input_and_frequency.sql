-- Pann: manual input (feeds, links), collection frequency, reversible rejection.

-- ---------------------------------------------------------------------------
-- Sources: kind hint and frequency override
-- ---------------------------------------------------------------------------
alter table public.sources
  -- Kind of content this source mostly produces (legal for EUR-Lex, tool for GitHub…).
  -- Used as a triage hint and to pick the collection interval from the topic config.
  add column default_kind public.item_kind,
  -- Per-source override; null = interval of the topic config for default_kind.
  add column interval_hours integer check (interval_hours between 1 and 2160),
  add column created_by uuid references auth.users (id) on delete set null default auth.uid();

create unique index sources_topic_rss_url_idx
  on public.sources (topic_id, (config ->> 'url'))
  where type = 'rss';

-- ---------------------------------------------------------------------------
-- Items: provenance
-- ---------------------------------------------------------------------------
alter table public.items
  add column origin text not null default 'collected' check (origin in ('collected', 'manual')),
  add column added_by uuid references auth.users (id) on delete set null;

comment on column public.items.origin is
  'manual = added by a user. Title is user-provided: collectors must refresh title and content '
  'of manual items instead of trusting them (items are shared across workspaces).';

-- ---------------------------------------------------------------------------
-- Manual link: upsert the shared item and attach it to the topic.
-- Security definer because users cannot write `items` directly; access to the
-- topic is checked explicitly. The URL must already be normalised by the API.
-- ---------------------------------------------------------------------------
create or replace function public.add_manual_item(
  p_topic_id uuid,
  p_canonical_url text,
  p_title text,
  p_kind public.item_kind default null,
  p_status public.item_topic_status default 'validated'
)
returns table (item_id uuid, status public.item_topic_status, created boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_item_id uuid;
  v_status public.item_topic_status;
begin
  if not private.can_access_topic(p_topic_id) then
    raise exception 'Topic not found' using errcode = '42501';
  end if;
  if p_canonical_url !~ '^https://[^\s]+$' or length(p_canonical_url) > 2048 then
    raise exception 'Invalid URL' using errcode = '22023';
  end if;
  if p_status not in ('new', 'validated') then
    raise exception 'Initial status must be new or validated' using errcode = '22023';
  end if;

  insert into public.items (canonical_url, title, kind, origin, added_by)
  values (p_canonical_url, left(coalesce(nullif(trim(p_title), ''), p_canonical_url), 500), p_kind, 'manual', auth.uid())
  on conflict (canonical_url) do nothing;

  select i.id into v_item_id from public.items i where i.canonical_url = p_canonical_url;

  insert into public.item_topics (item_id, topic_id, status, validated_at)
  values (v_item_id, p_topic_id, p_status, case when p_status = 'validated' then now() end)
  on conflict on constraint item_topics_pkey do nothing;

  if found then
    return query select v_item_id, p_status, true;
  else
    select it.status into v_status from public.item_topics it
    where it.item_id = v_item_id and it.topic_id = p_topic_id;
    return query select v_item_id, v_status, false;
  end if;
end;
$$;

revoke execute on function public.add_manual_item from public, anon;
grant execute on function public.add_manual_item to authenticated;

-- ---------------------------------------------------------------------------
-- Rejection is no longer final for the user: rejected -> new | validated.
-- Still never re-proposed automatically by jobs. Keep in sync with
-- packages/shared/src/status.ts.
-- ---------------------------------------------------------------------------
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
  ) then
    raise exception 'Transition % -> % is not allowed', old.status, new.status
      using errcode = 'check_violation';
  end if;

  new.validated_at := case when new.status = 'validated' then now() else null end;
  return new;
end;
$$;
