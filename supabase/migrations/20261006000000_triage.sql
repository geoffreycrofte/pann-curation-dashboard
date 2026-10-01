-- Pann: AI triage (step 3). Written by jobs only (service role).

alter table public.item_topics
  -- One short sentence explaining the score, in the topic's first output language.
  add column triage_reason text,
  add column triaged_at timestamptz,
  -- Failed attempts (refusal, invalid output, provider error); triage gives up at 3.
  add column triage_attempts smallint not null default 0,
  add column triage_error text;

-- Queue of items waiting for triage.
create index item_topics_untriaged_idx on public.item_topics (topic_id, created_at)
  where relevance_score is null and status = 'new';
