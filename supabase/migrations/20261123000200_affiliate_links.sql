-- Affiliate links (2026-11-23): the sign-up address Glimr recommends for a service the
-- person pays herself (own-keys offer), set by the platform admins. Shown on the
-- Connections page with a disclosure; a service without one shows nothing.
alter table public.platform_settings
  add column affiliate_links jsonb not null default '{}'::jsonb
    check (jsonb_typeof(affiliate_links) = 'object');
grant update (affiliate_links) on public.platform_settings to authenticated;

-- Signed-in people: the links only, never the other settings.
create or replace function public.affiliate_links()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select jsonb_object_agg(k, v)
     from jsonb_each_text(s.affiliate_links) as e(k, v)
     where v ~ '^https://[^\s]+$'),
    '{}'::jsonb)
  from public.platform_settings s;
$$;
revoke execute on function public.affiliate_links from public, anon;
grant execute on function public.affiliate_links to authenticated;
