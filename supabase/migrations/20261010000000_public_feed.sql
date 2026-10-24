-- Pann: public feeds (RSS 2.0 and JSON Feed) of the validated items of a topic, one
-- per language. Off by default. Once turned on, the feed is reachable at an address
-- holding a random key: anyone with the address can read it, and changing the key
-- revokes the old address.

alter table public.topics
  add column feed_key text unique
    check (feed_key ~ '^[A-Za-z0-9_-]{24,64}$');

-- ---------------------------------------------------------------------------
-- Read by anonymous requests (feed readers), hence security definer: it returns
-- only what a feed shows (validated items, their summary in the language, the
-- topic name and feed settings), and nothing when the key is unknown.
-- ---------------------------------------------------------------------------
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
        select i.id, i.canonical_url as url, i.title, i.source_lang, i.kind,
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

revoke execute on function public.topic_feed from public;
grant execute on function public.topic_feed to anon, authenticated;
