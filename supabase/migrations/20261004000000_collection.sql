-- Pann: collection (step 2).

-- ---------------------------------------------------------------------------
-- "Collect at next run": set by the user from the board (RLS allows it),
-- read by the hourly cron. The user request itself never collects.
-- ---------------------------------------------------------------------------
alter table public.sources add column run_requested_at timestamptz;

-- ---------------------------------------------------------------------------
-- Ingestion of collected items for one topic, in one transaction.
-- p_items: [{ canonical_url, title, content, published_at, source_lang, kind, change_signature }]
--
-- Rules (docs/CONTEXT.md, "anti-reproposition"):
-- 1. One item per canonical URL for the whole tool.
-- 2. Second-level dedup on the title (pg_trgm): a near-identical title on another
--    host, published within 7 days, is the same article (syndication, mirrors).
-- 3. An item already linked to the topic is never re-proposed, whatever its status,
--    except a published tool whose change_signature changed (new release).
-- 4. Manual items (user-provided title) get their title and content refreshed once.
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
        and i.kind is distinct from 'tool'
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
      insert into public.items (canonical_url, title, fetched_content, published_at, source_lang, kind, change_signature)
      values (
        v_url, v_title, v_it ->> 'content', v_published, nullif(v_it ->> 'source_lang', ''),
        (nullif(v_it ->> 'kind', ''))::public.item_kind, v_sig
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
      insert into public.item_topics (item_id, topic_id, status) values (v_item_id, p_topic_id, 'new');
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

-- Jobs only.
revoke execute on function public.ingest_items from public, anon, authenticated;
grant execute on function public.ingest_items to service_role;
