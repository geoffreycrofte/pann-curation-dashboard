-- Contents in any language (2026-11-17): the interface stays in French and English, but a
-- topic can write its summaries, posts, newsletters and feeds in any language. The
-- `public.lang` enum ('fr', 'en') gives way to a BCP 47 tag in canonical form, as
-- canonicalLang (packages/shared/src/langs.ts) writes it: `fr`, `de`, `pt-BR`, `zh-Hant`.

create or replace function private.is_lang_tag(value text)
returns boolean
language sql immutable set search_path = ''
as $$
  select value ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$';
$$;

alter table public.summaries
  alter column lang type text using lang::text,
  add constraint summaries_lang_tag check (private.is_lang_tag(lang));

alter table public.posts
  alter column lang type text using lang::text,
  add constraint posts_lang_tag check (lang is null or private.is_lang_tag(lang));

alter table public.digests
  alter column lang type text using lang::text,
  add constraint digests_lang_tag check (private.is_lang_tag(lang));

-- The public feed takes any language: same body, text parameter.
drop function public.topic_feed(text, public.lang, integer);

create function public.topic_feed(p_key text, p_lang text, p_limit integer default 50)
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

revoke execute on function public.topic_feed(text, text, integer) from public;
grant execute on function public.topic_feed(text, text, integer) to anon, authenticated;

drop type public.lang;
