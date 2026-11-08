-- Pann: AI rewrites of a summary or a post, asked from the item page.
--
-- A user request never uses the secret key (needed to read the Anthropic key): it
-- records the request here (RLS proves access to the topic), a queued job runs it
-- with the secret key and writes the result, and the board polls the row.

create table public.rewrites (
  id           uuid primary key default gen_random_uuid(),
  topic_id     uuid not null references public.topics (id) on delete cascade,
  item_id      uuid not null references public.items (id) on delete cascade,
  requested_by uuid default auth.uid() references auth.users (id) on delete cascade,
  -- { text, preset, instruction, target: { kind: 'summary' | 'post', lang, channel? } }
  request      jsonb not null,
  status       text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  result       text,
  error        text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index rewrites_topic_idx on public.rewrites (topic_id);
create index rewrites_item_idx on public.rewrites (item_id);
create index rewrites_requested_by_idx on public.rewrites (requested_by);

alter table public.rewrites enable row level security;

-- Each user creates and reads their own requests, on topics they can access.
create policy "members ask rewrites" on public.rewrites
  for insert to authenticated
  with check (private.can_access_topic(topic_id) and requested_by = (select auth.uid()));
create policy "members read their rewrites" on public.rewrites
  for select to authenticated
  using (requested_by = (select auth.uid()) and private.can_access_topic(topic_id));
revoke update, delete on public.rewrites from authenticated, anon;
