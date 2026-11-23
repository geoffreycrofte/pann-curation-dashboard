-- Inactive accounts (2026-11-23), as the privacy policy and the terms say: an account with
-- no sign-in for a year is deleted, after a warning e-mail sent a month before. Platform
-- admins are never concerned, nor the owners of a workspace paying a subscription (a
-- payment is activity). Signing in again cancels the warning.

-- Address of the board, for the links of the e-mails sent by scheduled jobs.
alter table public.platform_settings add column site_url text not null default 'https://glimr.cc'
  check (site_url ~ '^https?://[^/]+$');
grant update (site_url) on public.platform_settings to authenticated;

-- One warning per inactive account; gone with the account.
create table public.inactivity_notices (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  warned_at timestamptz not null default now()
);
-- Jobs only (secret key): RLS on, no policy.
alter table public.inactivity_notices enable row level security;

-- Jobs: forgets the warnings of the accounts that signed in since, then lists the accounts
-- to warn (11 months without signing in) and those to delete (warned a month ago or more,
-- still not back).
create or replace function public.inactive_accounts_for_jobs()
returns table (user_id uuid, email text, action text)
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.inactivity_notices n
  using auth.users u
  where u.id = n.user_id and coalesce(u.last_sign_in_at, u.created_at) > n.warned_at;

  return query
  with candidates as (
    select u.id, u.email::text as email, coalesce(u.last_sign_in_at, u.created_at) as seen_at
    from auth.users u
    where u.email is not null
      and not exists (select 1 from private.platform_admins a where a.user_id = u.id)
      and not exists (
        select 1 from public.workspace_members m
        join public.workspaces w on w.id = m.workspace_id
        where m.user_id = u.id and m.role = 'owner'
          and w.billing_status in ('active', 'past_due', 'canceled')
          and coalesce(w.current_period_end > now(), w.billing_status <> 'canceled')
      )
  )
  select c.id, c.email, 'warn'::text
  from candidates c
  where c.seen_at < now() - interval '11 months'
    and not exists (select 1 from public.inactivity_notices n where n.user_id = c.id)
  union all
  select c.id, c.email, 'delete'::text
  from candidates c
  join public.inactivity_notices n on n.user_id = c.id
  where n.warned_at < now() - interval '30 days';
end;
$$;
revoke execute on function public.inactive_accounts_for_jobs from public, anon, authenticated;
grant execute on function public.inactive_accounts_for_jobs to service_role;
