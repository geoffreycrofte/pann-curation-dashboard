-- Pann: social diffusion (step 6). Posts of a validated item are scheduled on a slot of
-- the topic, then published by a job: LinkedIn and Bluesky through Zernio, Mastodon
-- through its own API. One post per language, never a bilingual post.

-- ---------------------------------------------------------------------------
-- New services: Zernio (LinkedIn, Bluesky) and Mastodon.
-- `meta` holds what is not secret and is useful to show and configure:
-- Zernio accounts, Mastodon instance and account. Never the key itself.
-- ---------------------------------------------------------------------------
alter table public.workspace_credentials
  drop constraint workspace_credentials_provider_check;
alter table public.workspace_credentials
  add constraint workspace_credentials_provider_check
    check (provider in ('anthropic', 'exa', 'github', 'zernio', 'mastodon'));
alter table public.workspace_credentials
  add column meta jsonb not null default '{}'::jsonb;

-- Same function with a `p_meta` argument; the old signature is replaced.
drop function public.set_workspace_credential(uuid, text, text, text, text);

create function public.set_workspace_credential(
  p_workspace_id uuid,
  p_provider text,
  p_secret text,
  p_status text default 'unchecked',
  p_status_detail text default null,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret text := trim(p_secret);
  v_secret_id uuid;
begin
  if not private.is_owner(p_workspace_id) then
    raise exception 'Only workspace owners can manage credentials' using errcode = '42501';
  end if;
  if p_provider not in ('anthropic', 'exa', 'github', 'zernio', 'mastodon') then
    raise exception 'Unknown provider' using errcode = '22023';
  end if;
  if length(v_secret) < 8 or length(v_secret) > 500 then
    raise exception 'Invalid key' using errcode = '22023';
  end if;
  if p_status not in ('unchecked', 'ok', 'invalid') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_meta, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid meta' using errcode = '22023';
  end if;

  select c.secret_id into v_secret_id
  from public.workspace_credentials c
  where c.workspace_id = p_workspace_id and c.provider = p_provider;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      v_secret, 'pann/' || p_workspace_id || '/' || p_provider, 'Pann workspace credential'
    );
    insert into public.workspace_credentials
      (workspace_id, provider, secret_id, hint, status, status_detail, checked_at, updated_by, meta)
    values (
      p_workspace_id, p_provider, v_secret_id, right(v_secret, 4), p_status, p_status_detail,
      case when p_status <> 'unchecked' then now() end, auth.uid(), coalesce(p_meta, '{}'::jsonb)
    );
  else
    perform vault.update_secret(v_secret_id, v_secret);
    update public.workspace_credentials set
      hint = right(v_secret, 4),
      status = p_status,
      status_detail = p_status_detail,
      checked_at = case when p_status <> 'unchecked' then now() end,
      updated_at = now(),
      updated_by = auth.uid(),
      meta = coalesce(p_meta, '{}'::jsonb)
    where workspace_id = p_workspace_id and provider = p_provider;
  end if;
end;
$$;

revoke execute on function public.set_workspace_credential from public, anon;
grant execute on function public.set_workspace_credential to authenticated;

-- ---------------------------------------------------------------------------
-- Slot of an item: one item per slot and topic (the database refuses a second one).
-- ---------------------------------------------------------------------------
alter table public.item_topics add column publish_at timestamptz;
create unique index item_topics_slot_idx on public.item_topics (topic_id, publish_at)
  where publish_at is not null;

-- ---------------------------------------------------------------------------
-- Publication state of a post.
-- claimed_at: a job is publishing it (another run leaves it alone for 10 minutes).
-- publish_attempts: definite failures so far; also part of the idempotency key, so
-- that a retry after a lost answer is not published twice.
-- ---------------------------------------------------------------------------
alter table public.posts
  add column published_url text,
  add column claimed_at timestamptz,
  add column publish_attempts smallint not null default 0;

create index posts_due_idx on public.posts (scheduled_at) where status = 'scheduled';

-- Users edit the text of a post; everything else goes through the functions below
-- (scheduling) or the jobs (publication).
revoke insert, delete, update on public.posts from authenticated, anon;
grant update (body, edited_by_human, updated_at) on public.posts to authenticated;

-- ---------------------------------------------------------------------------
-- Schedule the posts of an item on a slot computed by the API (or now). The API
-- chooses the posts (an account is set for their channel and language, their length
-- fits). Failed posts can be chosen again: this is how a publication is retried.
-- ---------------------------------------------------------------------------
create or replace function public.schedule_item(
  p_topic_id uuid,
  p_item_id uuid,
  p_publish_at timestamptz,
  p_post_ids uuid[]
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.item_topic_status;
  v_count integer;
begin
  if not private.can_access_topic(p_topic_id) then
    raise exception 'Topic not found' using errcode = '42501';
  end if;
  if p_publish_at < now() - interval '1 minute' then
    raise exception 'Slot in the past' using errcode = '22023';
  end if;

  select status into v_status from public.item_topics
  where topic_id = p_topic_id and item_id = p_item_id
  for update;
  if v_status is null or v_status not in ('validated', 'published') then
    raise exception 'Item not validated' using errcode = '22023';
  end if;

  -- Unique index: a slot already taken raises unique_violation (23505).
  update public.item_topics set publish_at = p_publish_at
  where topic_id = p_topic_id and item_id = p_item_id;

  update public.posts set
    status = 'scheduled',
    scheduled_at = p_publish_at,
    claimed_at = null,
    last_error = null
  where topic_id = p_topic_id and item_id = p_item_id
    and status in ('draft', 'failed')
    and id = any (p_post_ids);
  get diagnostics v_count = row_count;

  -- Posts already scheduled for this item follow the item to its new slot.
  update public.posts set scheduled_at = p_publish_at
  where topic_id = p_topic_id and item_id = p_item_id
    and status = 'scheduled' and claimed_at is null;

  if not exists (
    select 1 from public.posts
    where topic_id = p_topic_id and item_id = p_item_id and status = 'scheduled'
  ) then
    raise exception 'Nothing to schedule' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;

-- Take the item off the queue: its scheduled posts go back to drafts.
create or replace function public.unschedule_item(p_topic_id uuid, p_item_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.can_access_topic(p_topic_id) then
    raise exception 'Topic not found' using errcode = '42501';
  end if;
  update public.posts set status = 'draft', scheduled_at = null
  where topic_id = p_topic_id and item_id = p_item_id
    and status = 'scheduled' and claimed_at is null;
  get diagnostics v_count = row_count;
  update public.item_topics set publish_at = null
  where topic_id = p_topic_id and item_id = p_item_id
    and not exists (
      select 1 from public.posts
      where topic_id = p_topic_id and item_id = p_item_id and status = 'scheduled'
    );
  return v_count;
end;
$$;

revoke execute on function public.schedule_item from public, anon;
revoke execute on function public.unschedule_item from public, anon;
grant execute on function public.schedule_item to authenticated;
grant execute on function public.unschedule_item to authenticated;

-- An item that leaves `validated` (back to new, rejected) leaves the queue too.
-- Security definer: users cannot change the status of a post themselves.
create or replace function private.unschedule_on_status_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'validated' and new.status in ('new', 'rejected', 'archived') then
    new.publish_at := null;
    update public.posts set status = 'draft', scheduled_at = null
    where topic_id = new.topic_id and item_id = new.item_id
      and status = 'scheduled' and claimed_at is null;
  end if;
  return new;
end;
$$;

create trigger item_topics_unschedule
  before update of status on public.item_topics
  for each row execute function private.unschedule_on_status_change();

-- ---------------------------------------------------------------------------
-- Jobs only: take the posts that are due. Two runs never take the same post;
-- a post taken by a run that died is taken again after 10 minutes (the
-- idempotency key prevents a double publication).
-- ---------------------------------------------------------------------------
create or replace function public.claim_due_posts(p_limit integer default 20)
returns setof public.posts
language sql security definer set search_path = ''
as $$
  update public.posts p set claimed_at = now()
  where p.id in (
    select id from public.posts
    where status = 'scheduled'
      and scheduled_at <= now()
      and (claimed_at is null or claimed_at < now() - interval '10 minutes')
    order by scheduled_at
    limit p_limit
    for update skip locked
  )
  returning p.*;
$$;

revoke execute on function public.claim_due_posts from public, anon, authenticated;
grant execute on function public.claim_due_posts to service_role;
