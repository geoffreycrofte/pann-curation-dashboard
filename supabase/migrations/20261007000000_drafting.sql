-- Pann: AI drafting (step 4): summaries FR/EN, key excerpt, post drafts.

-- ---------------------------------------------------------------------------
-- Drafting state per item and topic (written by jobs; queued by triggers/RPC).
-- ---------------------------------------------------------------------------
alter table public.item_topics
  add column draft_status text not null default 'none'
    check (draft_status in ('none', 'pending', 'ready', 'failed')),
  -- insufficient_content, budget_exceeded, missing_credential:anthropic, refusal…
  add column draft_error text,
  add column drafted_at timestamptz,
  add column draft_attempts smallint not null default 0;

create index item_topics_draft_queue_idx on public.item_topics (topic_id, validated_at)
  where draft_status = 'pending';

-- Validating an item queues its drafting (unless drafts already exist).
create or replace function private.queue_draft_on_validate()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'validated' and old.status is distinct from 'validated'
     and new.draft_status in ('none', 'failed') then
    new.draft_status := 'pending';
    new.draft_error := null;
    new.draft_attempts := 0;
  end if;
  return new;
end;
$$;

create trigger item_topics_queue_draft
  before update of status on public.item_topics
  for each row execute function private.queue_draft_on_validate();

-- "Regenerate" from the board: members queue a new drafting of a validated item.
create or replace function public.request_draft(p_topic_id uuid, p_item_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_access_topic(p_topic_id) then
    raise exception 'Topic not found' using errcode = '42501';
  end if;
  update public.item_topics
  set draft_status = 'pending', draft_error = null, draft_attempts = 0
  where topic_id = p_topic_id and item_id = p_item_id
    and status in ('validated', 'published');
  return found;
end;
$$;

revoke execute on function public.request_draft from public, anon;
grant execute on function public.request_draft to authenticated;

-- ---------------------------------------------------------------------------
-- Drafts edited by a person are kept when drafting runs again.
-- ---------------------------------------------------------------------------
alter table public.posts add column edited_by_human boolean not null default false;
alter table public.posts add column updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Spending of the current month (UTC) for a topic, by operation.
-- Security invoker: members only see the usage of their own workspaces (RLS).
-- ---------------------------------------------------------------------------
create or replace function public.topic_month_usage(p_topic_id uuid)
returns table (operation text, cost_usd numeric, calls bigint)
language sql stable security invoker set search_path = ''
as $$
  select coalesce(u.operation, 'other'), sum(u.cost_usd), count(*)
  from public.usage_log u
  where u.topic_id = p_topic_id
    and u.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
  group by 1;
$$;

revoke execute on function public.topic_month_usage from public, anon;
grant execute on function public.topic_month_usage to authenticated, service_role;
