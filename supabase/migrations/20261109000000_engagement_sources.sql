-- Pann: engagement sources (Hacker News, Bluesky) and the tool of each source and item.
--
-- A topic has two tools (docs/DECISIONS.md, "un thème, deux outils"). Sources and the
-- items they bring now say which one they feed: curation (the board, posts and
-- newsletter) or engagement (conversations where the product's team can help). The
-- two never mix: engagement items are not drafted, scheduled or sent.

alter type public.source_type add value if not exists 'hackernews';
alter type public.source_type add value if not exists 'bluesky';

alter table public.sources
  add column module text not null default 'curation' check (module in ('curation', 'engagement'));

alter table public.item_topics
  add column module text not null default 'curation' check (module in ('curation', 'engagement')),
  -- Engagement triage: what to do, how to help, how risky a reply would be.
  add column engagement_decision text check (engagement_decision in ('reply', 'watch', 'skip')),
  add column engagement_angle text,
  add column engagement_risk text check (engagement_risk in ('low', 'medium', 'high'));

create index item_topics_topic_module_status_idx on public.item_topics (topic_id, module, status);

-- Facts of a conversation shared with every topic: platform, author, thread, points.
alter table public.items add column meta jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Ingestion now records the tool of the items it links (p_module).
-- ---------------------------------------------------------------------------
drop function public.ingest_items(uuid, jsonb);

create function public.ingest_items(
  p_topic_id uuid,
  p_items jsonb,
  p_module text default 'curation'
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_it jsonb;
  v_url text;
  v_title text;
  v_sig text;
  v_published timestamptz;
  v_item_id uuid;
  v_status public.item_topic_status;
  v_published_sig text;
  v_new int := 0;
  v_linked int := 0;
  v_duplicates int := 0;
  v_reopened int := 0;
  v_known int := 0;
begin
  if p_module not in ('curation', 'engagement') then
    raise exception 'Unknown module' using errcode = '22023';
  end if;

  for v_it in select value from jsonb_array_elements(p_items) loop
    v_url := v_it ->> 'canonical_url';
    v_title := left(coalesce(nullif(trim(v_it ->> 'title'), ''), v_url), 500);
    v_sig := nullif(v_it ->> 'change_signature', '');
    v_published := (v_it ->> 'published_at')::timestamptz;
    v_item_id := null;

    if v_url !~ '^https://[^\s]+$' then
      continue;
    end if;

    select i.id into v_item_id from public.items i where i.canonical_url = v_url;

    -- Conversations are never merged on their title: the comments of a story share it.
    if v_item_id is null and p_module = 'curation' and length(v_title) >= 20 then
      select i.id into v_item_id
      from public.items i
      where i.discovered_at > now() - interval '60 days'
        -- Tools (repositories tracked by release) are not syndicated articles.
        and i.change_signature is null
        and split_part(i.canonical_url, '/', 3) <> split_part(v_url, '/', 3)
        and (i.published_at is null or v_published is null
             or abs(extract(epoch from i.published_at - v_published)) <= 7 * 86400)
        and extensions.similarity(i.title, v_title) >= 0.9
      order by extensions.similarity(i.title, v_title) desc
      limit 1;
      if v_item_id is not null then
        v_duplicates := v_duplicates + 1;
      end if;
    end if;

    if v_item_id is null then
      insert into public.items (canonical_url, title, fetched_content, published_at, source_lang, change_signature, meta)
      values (
        v_url, v_title, v_it ->> 'content', v_published, nullif(v_it ->> 'source_lang', ''), v_sig,
        coalesce(v_it -> 'meta', '{}'::jsonb)
      )
      on conflict (canonical_url) do nothing
      returning id into v_item_id;
      if v_item_id is null then
        select i.id into v_item_id from public.items i where i.canonical_url = v_url;
      else
        v_new := v_new + 1;
      end if;
    else
      update public.items i set
        title = case when i.origin = 'manual' and i.fetched_content is null then v_title else i.title end,
        fetched_content = coalesce(i.fetched_content, v_it ->> 'content'),
        published_at = coalesce(i.published_at, v_published),
        source_lang = coalesce(i.source_lang, nullif(v_it ->> 'source_lang', '')),
        change_signature = coalesce(v_sig, i.change_signature),
        -- Conversations: points and comment counts move, keep the latest.
        meta = i.meta || coalesce(v_it -> 'meta', '{}'::jsonb)
      where i.id = v_item_id;
    end if;

    select it.status, it.published_signature into v_status, v_published_sig
    from public.item_topics it
    where it.item_id = v_item_id and it.topic_id = p_topic_id;

    if not found then
      insert into public.item_topics (item_id, topic_id, status, kind, module)
      values (v_item_id, p_topic_id, 'new', nullif(v_it ->> 'kind', ''), p_module);
      v_linked := v_linked + 1;
    elsif v_status = 'published' and v_sig is not null and v_sig is distinct from v_published_sig then
      update public.item_topics set status = 'new'
      where item_id = v_item_id and topic_id = p_topic_id;
      v_reopened := v_reopened + 1;
    else
      v_known := v_known + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'new_items', v_new,
    'linked', v_linked,
    'duplicates', v_duplicates,
    'reopened', v_reopened,
    'known', v_known
  );
end;
$$;



revoke execute on function public.ingest_items from public, anon, authenticated;
grant execute on function public.ingest_items to service_role;

-- ---------------------------------------------------------------------------
-- Only curation items are drafted (summaries and posts). A reply to a conversation
-- is never published by an API: the person posts it.
-- ---------------------------------------------------------------------------
create or replace function private.queue_draft_on_validate()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.module = 'curation'
     and new.status = 'validated' and old.status is distinct from 'validated'
     and new.draft_status in ('none', 'failed') then
    new.draft_status := 'pending';
    new.draft_error := null;
    new.draft_attempts := 0;
  end if;
  return new;
end;
$$;

create or replace function public.request_draft(p_topic_id uuid, p_item_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_access_topic(p_topic_id) then
    raise exception 'Topic not found' using errcode = '42501';
  end if;
  update public.item_topics
  set draft_status = 'pending', draft_error = null, draft_attempts = 0
  where topic_id = p_topic_id and item_id = p_item_id
    and module = 'curation'
    and status in ('validated', 'published');
  return found;
end;
$$;
