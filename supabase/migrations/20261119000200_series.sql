-- Series (2026-11-19): "4 posts over 2 weeks" on one subject. A job proposes a plan (one
-- angle per post), the person edits it, then each post becomes a composition of the
-- Création tool, drafted from its angle and spread over the span when scheduled.

create table public.series (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references public.topics (id) on delete cascade,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  subject     text not null check (char_length(subject) between 3 and 300),
  -- What the person wants the series to say, facts included: the plan relies on it.
  notes       text not null default '' check (char_length(notes) <= 10000),
  post_count  smallint not null check (post_count between 2 and 8),
  span_days   smallint not null check (span_days between 1 and 60),
  ui_lang     text not null default 'fr' check (ui_lang in ('fr', 'en')),
  -- [{ subject, angle }], proposed by the job, then edited by the person.
  plan        jsonb not null default '[]'::jsonb check (jsonb_typeof(plan) = 'array'),
  status      text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error       text,
  created_at  timestamptz not null default now()
);
create index series_topic_idx on public.series (topic_id, created_at desc);
create index series_created_by_idx on public.series (created_by);

alter table public.series enable row level security;
create policy "members read series" on public.series
  for select to authenticated using ((select private.can_access_topic(topic_id)));
create policy "members create series" on public.series
  for insert to authenticated with check ((select private.can_access_topic(topic_id)));
create policy "members edit series" on public.series
  for update to authenticated
  using ((select private.can_access_topic(topic_id)))
  with check ((select private.can_access_topic(topic_id)));
create policy "members delete series" on public.series
  for delete to authenticated using ((select private.can_access_topic(topic_id)));
revoke insert, update on public.series from authenticated, anon;
grant insert (topic_id, subject, notes, post_count, span_days, ui_lang) on public.series to authenticated;
grant update (plan) on public.series to authenticated;

-- The posts of a series are compositions; a series removed leaves them as they are.
alter table public.compositions
  add column series_id uuid references public.series (id) on delete set null,
  add column series_position smallint check (series_position between 0 and 7);
create index compositions_series_idx on public.compositions (series_id, series_position);
grant insert (series_id, series_position) on public.compositions to authenticated;
