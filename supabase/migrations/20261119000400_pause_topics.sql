-- Pause a topic (2026-11-19): `topics.active` already stopped the collection, the triage,
-- the conversations and the automatic newsletter. A paused topic now also publishes
-- nothing: its due posts stay scheduled and go out once it is resumed.

create or replace function public.claim_due_posts(p_limit integer default 20)
returns setof public.posts
language sql security definer set search_path = ''
as $$
  update public.posts p set claimed_at = now()
  where p.id in (
    select po.id from public.posts po
    join public.topics t on t.id = po.topic_id
    where po.status = 'scheduled'
      and po.scheduled_at <= now()
      and (po.claimed_at is null or po.claimed_at < now() - interval '10 minutes')
      and t.active
    order by po.scheduled_at
    limit p_limit
    for update of po skip locked
  )
  returning p.*;
$$;

revoke execute on function public.claim_due_posts from public, anon, authenticated;
grant execute on function public.claim_due_posts to service_role;
