-- Pann: row level security and signup bootstrap.
-- Board/API requests run with the user's JWT, so RLS is the tenancy boundary.
-- Background jobs (collect, triage, publish) use the service role and bypass RLS.

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer to avoid recursive RLS on members)
-- ---------------------------------------------------------------------------
create schema if not exists private;

create or replace function private.is_member(ws uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_owner(ws uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

create or replace function private.can_access_topic(t uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.topics tp
    join public.workspace_members m on m.workspace_id = tp.workspace_id
    where tp.id = t and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_see_item(i uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.item_topics it
    join public.topics tp on tp.id = it.topic_id
    join public.workspace_members m on m.workspace_id = tp.workspace_id
    where it.item_id = i and m.user_id = (select auth.uid())
  );
$$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.topics            enable row level security;
alter table public.sources           enable row level security;
alter table public.items             enable row level security;
alter table public.item_topics       enable row level security;
alter table public.summaries         enable row level security;
alter table public.posts             enable row level security;
alter table public.digests           enable row level security;
alter table public.publications      enable row level security;
alter table public.usage_log         enable row level security;

-- Workspaces
create policy "members read workspace" on public.workspaces
  for select to authenticated using (private.is_member(id));
create policy "owners update workspace" on public.workspaces
  for update to authenticated using (private.is_owner(id));

create policy "members read memberships" on public.workspace_members
  for select to authenticated using (private.is_member(workspace_id));
create policy "owners manage memberships" on public.workspace_members
  for all to authenticated using (private.is_owner(workspace_id)) with check (private.is_owner(workspace_id));

-- Topics and sources: members manage them
create policy "members manage topics" on public.topics
  for all to authenticated using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy "members manage sources" on public.sources
  for all to authenticated using (private.can_access_topic(topic_id)) with check (private.can_access_topic(topic_id));

-- Items: read-only for users (written by jobs only)
create policy "members read items of their topics" on public.items
  for select to authenticated using (private.can_see_item(id));

-- Curation: members read and change statuses; creation is done by jobs
create policy "members read item_topics" on public.item_topics
  for select to authenticated using (private.can_access_topic(topic_id));
create policy "members update item_topics" on public.item_topics
  for update to authenticated using (private.can_access_topic(topic_id)) with check (private.can_access_topic(topic_id));

-- Editable AI output
create policy "members read summaries" on public.summaries
  for select to authenticated using (private.is_member(workspace_id));
create policy "members edit summaries" on public.summaries
  for update to authenticated using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));

create policy "members manage posts" on public.posts
  for all to authenticated using (private.can_access_topic(topic_id)) with check (private.can_access_topic(topic_id));

-- Read-only for users
create policy "members read digests" on public.digests
  for select to authenticated using (private.can_access_topic(topic_id));
create policy "members read publications" on public.publications
  for select to authenticated using (private.can_access_topic(topic_id));
create policy "members read usage" on public.usage_log
  for select to authenticated using (private.is_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Signup bootstrap: every new user gets a personal workspace (owner).
-- For personal use, keep public signups disabled in Supabase Auth and invite users.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ws uuid;
begin
  insert into public.workspaces (name)
  values (coalesce(split_part(new.email, '@', 1), 'Workspace'))
  returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
