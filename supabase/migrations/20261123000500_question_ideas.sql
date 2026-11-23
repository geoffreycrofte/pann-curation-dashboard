-- Recurring questions as ideas for posts (2026-11-23). The conversations of a topic often
-- ask the same thing again: on request, a job groups them into a few recurring questions,
-- each with an angle for a post that answers it, offered as ideas in Création.

create table public.question_ideas (
  topic_id     uuid primary key references public.topics (id) on delete cascade,
  status       text not null default 'idle' check (status in ('idle', 'pending', 'failed')),
  -- Language the person reads the ideas in (interface language at the request).
  ui_lang      text not null default 'fr' check (ui_lang in ('fr', 'en')),
  -- [{ question, angle, count, examples: [{ title, url }] }]
  ideas        jsonb not null default '[]'::jsonb check (jsonb_typeof(ideas) = 'array'),
  error        text,
  generated_at timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.question_ideas enable row level security;
create policy "members read the question ideas of their topics" on public.question_ideas
  for select to authenticated using ((select private.can_access_topic(topic_id)));
revoke insert, update, delete on public.question_ideas from authenticated, anon;

-- Members: ask for the recurring questions again. False while a run is already waiting.
create or replace function public.request_question_ideas(p_topic_id uuid, p_ui_lang text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_access_topic(p_topic_id) then
    raise exception 'Topic not found' using errcode = '42501';
  end if;
  if p_ui_lang not in ('fr', 'en') then
    raise exception 'Unknown language' using errcode = '22023';
  end if;
  insert into public.question_ideas (topic_id, status, ui_lang)
  values (p_topic_id, 'pending', p_ui_lang)
  on conflict (topic_id) do update
    set status = 'pending', ui_lang = excluded.ui_lang, error = null, updated_at = now()
    where public.question_ideas.status <> 'pending';
  return found;
end;
$$;
revoke execute on function public.request_question_ideas from public, anon;
grant execute on function public.request_question_ideas to authenticated;
