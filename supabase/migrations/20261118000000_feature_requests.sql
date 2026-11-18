-- Requests made from the product (onboarding, 2026-11-18): a network Pann does not
-- publish to yet ("Other network"), or a tool not available yet ("Create my own posts").
-- Answered and prioritised by the admins (admin space), never promised.

create table public.feature_requests (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  topic_id     uuid references public.topics (id) on delete set null,
  user_id      uuid references auth.users (id) on delete set null default auth.uid(),
  kind         text not null check (kind in ('network', 'feature')),
  -- Network named by the person, or the key of the tool ("compose").
  subject      text not null check (char_length(subject) between 1 and 60),
  status       text not null default 'new' check (status in ('new', 'planned', 'answered', 'declined')),
  created_at   timestamptz not null default now()
);
create index feature_requests_workspace_idx on public.feature_requests (workspace_id);
create index feature_requests_topic_idx on public.feature_requests (topic_id);
create index feature_requests_user_idx on public.feature_requests (user_id);
create index feature_requests_created_idx on public.feature_requests (created_at desc);

alter table public.feature_requests enable row level security;

-- Members file requests for their workspace and see them; the admins see and answer all.
create policy "members file requests" on public.feature_requests
  for insert to authenticated
  with check ((select private.is_member(workspace_id)) and user_id = (select auth.uid()));
create policy "members and admins read requests" on public.feature_requests
  for select to authenticated
  using ((select private.is_member(workspace_id)) or (select private.is_platform_admin()));
create policy "admins answer requests" on public.feature_requests
  for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));
revoke update, delete on public.feature_requests from authenticated, anon;
grant update (status) on public.feature_requests to authenticated;
