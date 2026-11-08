-- Pann: content kinds defined per topic.
--
-- The kinds (news, legal, tool, resource) were a fixed enum stored on the shared
-- items table. They become a list in each topic config (topics.config -> 'kinds',
-- defaults provided by the app), and the kind of an item is stored per topic, on
-- item_topics: the same article can be "legal" in one topic and "news" in another.
-- Keys are checked against the topic config by the API, not by the database.

-- ---------------------------------------------------------------------------
-- Kind per topic, kept from the shared item.
-- ---------------------------------------------------------------------------
alter table public.item_topics
  add column kind text check (kind ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(kind) <= 40);

update public.item_topics it set kind = i.kind::text
from public.items i
where i.id = it.item_id and i.kind is not null;

-- Users can change the kind of an item from the board (and reassign it when a kind
-- is removed), as well as its status.
grant update (kind) on public.item_topics to authenticated;

alter table public.sources
  alter column default_kind type text using default_kind::text;
alter table public.sources
  add constraint sources_default_kind_check
  check (default_kind ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(default_kind) <= 40);

-- ---------------------------------------------------------------------------
-- Functions writing or reading the kind: now on item_topics.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_items(p_topic_id uuid, p_items jsonb)
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

    if v_item_id is null and length(v_title) >= 20 then
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
      insert into public.items (canonical_url, title, fetched_content, published_at, source_lang, change_signature)
      values (
        v_url, v_title, v_it ->> 'content', v_published, nullif(v_it ->> 'source_lang', ''), v_sig
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
        change_signature = coalesce(v_sig, i.change_signature)
      where i.id = v_item_id;
    end if;

    select it.status, it.published_signature into v_status, v_published_sig
    from public.item_topics it
    where it.item_id = v_item_id and it.topic_id = p_topic_id;

    if not found then
      insert into public.item_topics (item_id, topic_id, status, kind)
      values (v_item_id, p_topic_id, 'new', nullif(v_it ->> 'kind', ''));
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


-- p_kind changes type: the old signature is dropped, grants are set again.
drop function public.add_manual_item(uuid, text, text, public.item_kind, public.item_topic_status);

create or replace function public.add_manual_item(
  p_topic_id uuid,
  p_canonical_url text,
  p_title text,
  p_kind text default null,
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

  insert into public.items (canonical_url, title, origin, added_by)
  values (p_canonical_url, left(coalesce(nullif(trim(p_title), ''), p_canonical_url), 500), 'manual', auth.uid())
  on conflict (canonical_url) do nothing;

  select i.id into v_item_id from public.items i where i.canonical_url = p_canonical_url;

  insert into public.item_topics (item_id, topic_id, status, validated_at, kind)
  values (v_item_id, p_topic_id, p_status, case when p_status = 'validated' then now() end, p_kind)
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

create or replace function public.topic_feed(p_key text, p_lang public.lang, p_limit integer default 50)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'topic', jsonb_build_object(
      'name_fr', t.name_fr,
      'name_en', t.name_en,
      'feed', coalesce(t.config -> 'feed', '{}'::jsonb)
    ),
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.validated_at desc)
      from (
        select i.id, i.canonical_url as url, i.title, i.source_lang, it.kind,
               it.validated_at, s.summary
        from public.item_topics it
        join public.items i on i.id = it.item_id
        join public.summaries s
          on s.item_id = it.item_id and s.workspace_id = t.workspace_id and s.lang = p_lang
        where it.topic_id = t.id
          and it.status in ('validated', 'published')
          and it.validated_at is not null
        order by it.validated_at desc
        limit least(greatest(p_limit, 1), 100)
      ) x
    ), '[]'::jsonb)
  )
  from public.topics t
  where t.feed_key = p_key and t.active;
$$;


-- ---------------------------------------------------------------------------
-- The shared items no longer carry a kind.
-- ---------------------------------------------------------------------------
alter table public.items drop column kind;
drop type public.item_kind;
