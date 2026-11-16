-- Draft only the posts an item lacks (a network or a language added to the topic after
-- the item was drafted), without touching its summaries or its other posts.
-- draft_scope: 'all' (default, every drafting so far) or 'missing'. The drafting job puts
-- it back to 'all' when it ends, so any later request drafts everything again.

alter table public.item_topics
  add column draft_scope text not null default 'all'
    check (draft_scope in ('all', 'missing'));

create or replace function public.request_missing_posts(p_topic_id uuid, p_item_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_access_topic(p_topic_id) then
    raise exception 'Topic not found' using errcode = '42501';
  end if;
  update public.item_topics
  set draft_status = 'pending', draft_error = null, draft_attempts = 0, draft_scope = 'missing'
  where topic_id = p_topic_id and item_id = p_item_id
    and module = 'curation'
    and status in ('validated', 'published')
    and draft_status = 'ready';
  return found;
end;
$$;

revoke execute on function public.request_missing_posts from public, anon;
grant execute on function public.request_missing_posts to authenticated;
