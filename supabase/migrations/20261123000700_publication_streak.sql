-- Publication streak (2026-11-23): the weeks in a row (Monday to Sunday, in the topic's time
-- zone) with at least one post published, shown with a flame. A week while the topic was
-- paused (by hand or by billing) does not break the streak, nor count. On Friday, a topic
-- whose streak would break on Sunday (nothing published nor scheduled this week) gets an
-- e-mail; a paused topic gets none.

-- When topics were paused, to tell a paused week from an empty one.
create table public.topic_pauses (
  topic_id   uuid not null references public.topics (id) on delete cascade,
  paused_at  timestamptz not null,
  resumed_at timestamptz,
  primary key (topic_id, paused_at)
);
alter table public.topic_pauses enable row level security;
create policy "members read the pauses of their topics" on public.topic_pauses
  for select to authenticated using ((select private.can_access_topic(topic_id)));
revoke insert, update, delete on public.topic_pauses from authenticated, anon;

insert into public.topic_pauses (topic_id, paused_at)
select id, now() from public.topics where not active;

create or replace function private.log_topic_pause()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.active and not new.active then
    insert into public.topic_pauses (topic_id, paused_at) values (new.id, now())
    on conflict do nothing;
  elsif not old.active and new.active then
    update public.topic_pauses set resumed_at = now()
    where topic_id = new.id and resumed_at is null;
  end if;
  return new;
end;
$$;
create trigger topics_log_pause
  after update of active on public.topics
  for each row execute function private.log_topic_pause();

-- The streak of a topic. weeks: weeks in a row with a publication, this week included if it
-- has one already; this_week: published this week; scheduled: a post waits for a slot this
-- week; paused: the topic is paused now.
create or replace function private.topic_streak(p_topic_id uuid)
returns table (
  weeks integer,
  this_week boolean,
  scheduled boolean,
  paused boolean,
  week_start timestamptz,
  local_now timestamp
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_topic record;
  v_tz text;
  v_now timestamp;
  v_week timestamp;
  v_count integer := 0;
  v_from timestamptz;
  v_to timestamptz;
  i integer;
begin
  select t.active, t.created_at, t.config into v_topic from public.topics t where t.id = p_topic_id;
  if not found then
    return;
  end if;
  v_tz := coalesce(v_topic.config -> 'schedule' ->> 'timezone', 'UTC');
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;
  v_now := now() at time zone v_tz;
  v_week := date_trunc('week', v_now);

  this_week := exists (
    select 1 from public.posts p
    where p.topic_id = p_topic_id and p.status = 'sent' and p.sent_at >= (v_week at time zone v_tz)
  );
  scheduled := exists (
    select 1 from public.posts p
    where p.topic_id = p_topic_id and p.status = 'scheduled'
      and p.scheduled_at < ((v_week + interval '7 days') at time zone v_tz)
  );
  paused := not v_topic.active;

  -- Past weeks, from last week backwards: a published week counts, a paused one is skipped,
  -- an empty one ends the streak. At most two years back, never before the topic.
  for i in 1..104 loop
    v_from := (v_week - make_interval(weeks => i)) at time zone v_tz;
    v_to := (v_week - make_interval(weeks => i - 1)) at time zone v_tz;
    exit when v_to <= v_topic.created_at;
    if exists (
      select 1 from public.posts p
      where p.topic_id = p_topic_id and p.status = 'sent'
        and p.sent_at >= v_from and p.sent_at < v_to
    ) then
      v_count := v_count + 1;
    elsif not exists (
      select 1 from public.topic_pauses tp
      where tp.topic_id = p_topic_id
        and tp.paused_at < v_to and coalesce(tp.resumed_at, now()) > v_from
    ) then
      exit;
    end if;
  end loop;

  weeks := v_count + case when this_week then 1 else 0 end;
  week_start := v_week at time zone v_tz;
  local_now := v_now;
  return next;
end;
$$;
revoke execute on function private.topic_streak from public, anon, authenticated;

-- Members: the streak of a topic, for the board.
create or replace function public.topic_streak(p_topic_id uuid)
returns table (weeks integer, this_week boolean, scheduled boolean, paused boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.can_access_topic(p_topic_id) then
    raise exception 'Topic not found' using errcode = '42501';
  end if;
  return query
    select s.weeks, s.this_week, s.scheduled, s.paused from private.topic_streak(p_topic_id) s;
end;
$$;
revoke execute on function public.topic_streak from public, anon;
grant execute on function public.topic_streak to authenticated;

-- One warning per topic and week.
create table public.streak_warnings (
  topic_id   uuid not null references public.topics (id) on delete cascade,
  week_start timestamptz not null,
  sent_at    timestamptz not null default now(),
  primary key (topic_id, week_start)
);
-- Jobs only (secret key): RLS on, no policy.
alter table public.streak_warnings enable row level security;

-- Jobs: the topics to warn now. Running, with a streak, nothing published nor scheduled this
-- week, Friday from 9 a.m. in their time zone, not warned yet this week. With the addresses
-- of the workspace's owners.
create or replace function public.streak_warnings_for_jobs()
returns table (
  topic_id uuid,
  name_fr text,
  name_en text,
  weeks integer,
  week_start timestamptz,
  emails text[]
)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.name_fr, t.name_en, s.weeks, s.week_start,
    array(
      select u.email::text from public.workspace_members m
      join auth.users u on u.id = m.user_id
      where m.workspace_id = t.workspace_id and m.role = 'owner' and u.email is not null
    )
  from public.topics t
  cross join lateral private.topic_streak(t.id) s
  where t.active
    and s.weeks > 0 and not s.this_week and not s.scheduled and not s.paused
    and extract(isodow from s.local_now) = 5 and extract(hour from s.local_now) >= 9
    and not exists (
      select 1 from public.streak_warnings w
      where w.topic_id = t.id and w.week_start = s.week_start
    );
$$;
revoke execute on function public.streak_warnings_for_jobs from public, anon, authenticated;
grant execute on function public.streak_warnings_for_jobs to service_role;
