-- Voice from past posts (2026-11-19): the person pastes posts they are happy with, a job
-- proposes style and post rules from them, which the person reviews in the settings.
-- Nothing is saved in the topic by the job: the proposal waits for the person.

create table public.voice_analyses (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references public.topics (id) on delete cascade,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  -- Past posts pasted by the person.
  samples     text not null check (char_length(samples) between 50 and 12000),
  -- Language the rules are written in (interface language of the person).
  ui_lang     text not null default 'fr' check (ui_lang in ('fr', 'en')),
  -- { style_rules, post_rules }: proposed, not applied.
  result      jsonb,
  status      text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  error       text,
  created_at  timestamptz not null default now()
);
create index voice_analyses_topic_idx on public.voice_analyses (topic_id, created_at desc);
create index voice_analyses_created_by_idx on public.voice_analyses (created_by);

alter table public.voice_analyses enable row level security;
create policy "members read voice analyses" on public.voice_analyses
  for select to authenticated using ((select private.can_access_topic(topic_id)));
create policy "members ask voice analyses" on public.voice_analyses
  for insert to authenticated with check ((select private.can_access_topic(topic_id)));
-- The job (secret key) writes the result; the person only asks.
revoke insert, update, delete on public.voice_analyses from authenticated, anon;
grant insert (topic_id, samples, ui_lang) on public.voice_analyses to authenticated;
