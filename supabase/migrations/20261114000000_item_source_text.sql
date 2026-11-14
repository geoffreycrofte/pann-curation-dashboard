-- Source text pasted by a person when Pann could not read the page (paywall, page built
-- by script). It replaces items.fetched_content, then drafting is queued again, exactly
-- like request_draft. The item is shared by the topics that follow it: the pasted text
-- is the article itself, so every topic benefits from it.
-- Limits match SOURCE_TEXT_MIN / SOURCE_TEXT_MAX (packages/shared/src/drafting.ts).

create or replace function public.set_item_source_text(
  p_topic_id uuid,
  p_item_id uuid,
  p_text text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_text text := coalesce(btrim(p_text), '');
begin
  if not private.can_access_topic(p_topic_id) then
    raise exception 'Topic not found' using errcode = '42501';
  end if;
  if char_length(v_text) not between 600 and 60000 then
    raise exception 'Source text length out of range' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.item_topics
    where topic_id = p_topic_id and item_id = p_item_id
      and module = 'curation'
      and status in ('validated', 'published')
  ) then
    return false;
  end if;
  update public.items set fetched_content = v_text where id = p_item_id;
  update public.item_topics
  set draft_status = 'pending', draft_error = null, draft_attempts = 0
  where topic_id = p_topic_id and item_id = p_item_id;
  return true;
end;
$$;

revoke execute on function public.set_item_source_text from public, anon;
grant execute on function public.set_item_source_text to authenticated;
