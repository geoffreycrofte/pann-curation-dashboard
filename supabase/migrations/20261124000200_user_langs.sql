-- Language of the e-mails (2026-11-24). The board keeps the interface language in the
-- account (user_metadata.lang); the jobs write their e-mails in it.
create or replace function public.user_langs_for_jobs(p_emails text[])
returns table (email text, lang text)
language sql stable security definer set search_path = ''
as $$
  select lower(u.email)::text, nullif(u.raw_user_meta_data ->> 'lang', '')
  from auth.users u
  where lower(u.email) = any (p_emails);
$$;
revoke execute on function public.user_langs_for_jobs from public, anon, authenticated;
grant execute on function public.user_langs_for_jobs to service_role;
