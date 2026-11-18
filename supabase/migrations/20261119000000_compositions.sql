-- Création (2026-11-19): posts written by the person, not drawn from the news watch.
-- A composition starts from their notes, from links they give, or from sources Pann
-- searches; it gets one post per network and language, the person's own images (alt
-- text per language), and its own publication slots, distinct from the news watch's.

-- ---------------------------------------------------------------------------
-- Compositions
-- ---------------------------------------------------------------------------
create table public.compositions (
  id              uuid primary key default gen_random_uuid(),
  topic_id        uuid not null references public.topics (id) on delete cascade,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  -- What the posts are about, in the person's words.
  subject         text not null default '' check (char_length(subject) <= 300),
  -- Where the content comes from: their notes only, links they give, or a search.
  mode            text not null default 'notes' check (mode in ('notes', 'links', 'search')),
  notes           text not null default '' check (char_length(notes) <= 10000),
  -- [{ url, title, excerpt, selected }]: given links, or search results to choose from.
  sources         jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  -- Networks to write for (a subset of the topic's networks), checked by the API.
  channels        text[] not null default '{}',
  -- Drafting and search run as jobs; the board polls these.
  draft_status    text not null default 'idle' check (draft_status in ('idle', 'pending', 'failed')),
  draft_error     text,
  research_status text not null default 'idle' check (research_status in ('idle', 'pending', 'failed')),
  research_error  text,
  -- Slot of the composition (its posts follow it), on the Création slots of the topic.
  publish_at      timestamptz,
  status          text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index compositions_topic_idx on public.compositions (topic_id, created_at desc);
create index compositions_created_by_idx on public.compositions (created_by);
-- One composition per Création slot (the news watch has its own, on item_topics).
create unique index compositions_slot_idx on public.compositions (topic_id, publish_at)
  where publish_at is not null;

alter table public.compositions enable row level security;
create policy "members read compositions" on public.compositions
  for select to authenticated using ((select private.can_access_topic(topic_id)));
create policy "members create compositions" on public.compositions
  for insert to authenticated with check ((select private.can_access_topic(topic_id)));
create policy "members edit compositions" on public.compositions
  for update to authenticated
  using ((select private.can_access_topic(topic_id)))
  with check ((select private.can_access_topic(topic_id)));
-- Only a draft can be deleted: what is scheduled or published stays in the history.
create policy "members delete draft compositions" on public.compositions
  for delete to authenticated
  using ((select private.can_access_topic(topic_id)) and status = 'draft');

-- The person writes the content; statuses and slots go through the functions below and
-- the jobs (secret key).
revoke insert, update on public.compositions from authenticated, anon;
grant insert (topic_id, subject, mode, notes, sources, channels) on public.compositions to authenticated;
grant update (subject, mode, notes, sources, channels, updated_at) on public.compositions to authenticated;

-- ---------------------------------------------------------------------------
-- Images of a composition: the person's own, stored in the composition-media bucket.
-- ---------------------------------------------------------------------------
create table public.composition_media (
  id             uuid primary key default gen_random_uuid(),
  composition_id uuid not null references public.compositions (id) on delete cascade,
  topic_id       uuid not null references public.topics (id) on delete cascade,
  -- <topic_id>/<composition_id>/<file> in the bucket.
  storage_path   text not null unique,
  mime           text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes          integer not null check (bytes > 0 and bytes <= 1000000),
  width          integer not null check (width > 0),
  height         integer not null check (height > 0),
  position       smallint not null default 0,
  -- Text alternative per content language ({ "fr": "…" }): required to publish.
  alt            jsonb not null default '{}'::jsonb check (jsonb_typeof(alt) = 'object'),
  -- Languages whose text alternative the AI proposed and the person has not edited yet.
  alt_proposed   text[] not null default '{}',
  alt_status     text not null default 'idle' check (alt_status in ('idle', 'pending', 'failed')),
  alt_error      text,
  created_at     timestamptz not null default now()
);
create index composition_media_composition_idx on public.composition_media (composition_id, position);
create index composition_media_topic_idx on public.composition_media (topic_id);

alter table public.composition_media enable row level security;
-- The image belongs to a composition of the same topic.
create policy "members manage composition media" on public.composition_media
  for all to authenticated
  using ((select private.can_access_topic(topic_id)))
  with check (
    (select private.can_access_topic(topic_id))
    and exists (
      select 1 from public.compositions c
      where c.id = composition_id and c.topic_id = composition_media.topic_id
    )
  );
revoke update on public.composition_media from authenticated, anon;
grant update (alt, alt_proposed, position) on public.composition_media to authenticated;

-- At most 4 images per composition: the most Bluesky takes in one post.
create or replace function private.check_composition_media_count()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select count(*) from public.composition_media where composition_id = new.composition_id) >= 4 then
    raise exception 'Too many images' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger composition_media_count
  before insert on public.composition_media
  for each row execute function private.check_composition_media_count();

-- ---------------------------------------------------------------------------
-- Storage: private bucket, one folder per topic. Members of the topic's workspace
-- upload, read and delete; the jobs read with the secret key (signed URLs, bytes).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('composition-media', 'composition-media', false, 1000000,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- The first folder of the path, as a topic id (null when it is not a uuid).
create or replace function private.storage_topic_id(p_name text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
declare
  v_folder text := split_part(p_name, '/', 1);
begin
  if v_folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_folder::uuid;
  end if;
  return null;
end;
$$;

create policy "members manage composition media files" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'composition-media'
    and (select private.can_access_topic(private.storage_topic_id(name)))
  )
  with check (
    bucket_id = 'composition-media'
    and (select private.can_access_topic(private.storage_topic_id(name)))
  );

-- ---------------------------------------------------------------------------
-- Posts: from an item of the news watch, or from a composition (exactly one).
-- ---------------------------------------------------------------------------
alter table public.posts
  alter column item_id drop not null,
  add column composition_id uuid references public.compositions (id) on delete cascade,
  add constraint posts_one_origin check (num_nonnulls(item_id, composition_id) = 1);
create unique index posts_composition_channel_lang_idx
  on public.posts (composition_id, channel, lang) where composition_id is not null;

-- ---------------------------------------------------------------------------
-- Schedule the posts of a composition on a Création slot computed by the API (or now).
-- Same rules as schedule_item: the API chooses the posts (an account is set, the
-- length fits, every image has its text alternative); failed posts can be retried.
-- ---------------------------------------------------------------------------
create or replace function public.schedule_composition(
  p_topic_id uuid,
  p_composition_id uuid,
  p_publish_at timestamptz,
  p_post_ids uuid[]
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_found boolean;
  v_count integer;
begin
  if not private.can_access_topic(p_topic_id) then
    raise exception 'Topic not found' using errcode = '42501';
  end if;
  if p_publish_at < now() - interval '1 minute' then
    raise exception 'Slot in the past' using errcode = '22023';
  end if;

  select true into v_found from public.compositions
  where id = p_composition_id and topic_id = p_topic_id
  for update;
  if v_found is null then
    raise exception 'Composition not found' using errcode = '42501';
  end if;

  -- Unique index: a slot already taken raises unique_violation (23505).
  update public.compositions set publish_at = p_publish_at, status = 'scheduled'
  where id = p_composition_id;

  update public.posts set
    status = 'scheduled',
    scheduled_at = p_publish_at,
    claimed_at = null,
    last_error = null
  where composition_id = p_composition_id
    and status in ('draft', 'failed')
    and id = any (p_post_ids);
  get diagnostics v_count = row_count;

  update public.posts set scheduled_at = p_publish_at
  where composition_id = p_composition_id and status = 'scheduled' and claimed_at is null;

  if not exists (
    select 1 from public.posts where composition_id = p_composition_id and status = 'scheduled'
  ) then
    raise exception 'Nothing to schedule' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;

-- Take the composition off the queue: its scheduled posts go back to drafts.
create or replace function public.unschedule_composition(p_topic_id uuid, p_composition_id uuid)
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
  where composition_id = p_composition_id and topic_id = p_topic_id
    and status = 'scheduled' and claimed_at is null;
  get diagnostics v_count = row_count;
  update public.compositions set publish_at = null, status = 'draft'
  where id = p_composition_id and topic_id = p_topic_id and status = 'scheduled'
    and not exists (
      select 1 from public.posts
      where composition_id = p_composition_id and status in ('scheduled', 'sent')
    );
  return v_count;
end;
$$;

revoke execute on function public.schedule_composition from public, anon;
revoke execute on function public.unschedule_composition from public, anon;
grant execute on function public.schedule_composition to authenticated;
grant execute on function public.unschedule_composition to authenticated;
