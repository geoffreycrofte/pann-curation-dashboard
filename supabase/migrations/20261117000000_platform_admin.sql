-- Pann administration: the keys Pann pays for itself (AI of the onboarding and of the
-- offers where Pann provides the AI, Zernio in platform mode) and the cost centre of that
-- spending. Reserved to platform admins, a list that only SQL can change: grant the role
-- once in the Supabase SQL editor (docs/DECISIONS.md, 2026-11-17):
--   insert into private.platform_admins (user_id)
--   select id from auth.users where email = '<admin email>';

create table private.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function private.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.platform_admins a where a.user_id = (select auth.uid())
  );
$$;

-- For the board: shows the admin link, and the API guards its admin routes with it.
create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_platform_admin();
$$;
revoke execute on function public.is_platform_admin from public, anon;
grant execute on function public.is_platform_admin to authenticated;

-- ---------------------------------------------------------------------------
-- Keys of Pann, in Supabase Vault like the workspace keys. Admins see the status and the
-- last 4 characters, never the key. Providers: see PLATFORM_PROVIDERS
-- (packages/shared/src/providers.ts).
-- ---------------------------------------------------------------------------
create table public.platform_credentials (
  provider      text primary key check (provider in ('anthropic', 'zernio')),
  secret_id     uuid not null,
  hint          text not null,
  status        text not null default 'unchecked' check (status in ('unchecked', 'ok', 'invalid')),
  status_detail text,
  checked_at    timestamptz,
  meta          jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null
);
create index platform_credentials_updated_by_idx on public.platform_credentials (updated_by);

alter table public.platform_credentials enable row level security;
create policy "platform admins read Pann keys status" on public.platform_credentials
  for select to authenticated using ((select private.is_platform_admin()));
revoke insert, update, delete on public.platform_credentials from authenticated, anon;

create or replace function public.set_platform_credential(
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
  if not private.is_platform_admin() then
    raise exception 'Platform admins only' using errcode = '42501';
  end if;
  if p_provider not in ('anthropic', 'zernio') then
    raise exception 'Unknown provider' using errcode = '22023';
  end if;
  if length(v_secret) < 8 or length(v_secret) > 500 then
    raise exception 'Invalid key' using errcode = '22023';
  end if;
  if p_status not in ('unchecked', 'ok', 'invalid') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  select c.secret_id into v_secret_id from public.platform_credentials c
  where c.provider = p_provider;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(v_secret, 'pann/platform/' || p_provider, 'Pann platform key');
    insert into public.platform_credentials
      (provider, secret_id, hint, status, status_detail, checked_at, meta, updated_by)
    values (
      p_provider, v_secret_id, right(v_secret, 4), p_status, p_status_detail,
      case when p_status <> 'unchecked' then now() end, coalesce(p_meta, '{}'::jsonb), auth.uid()
    );
  else
    perform vault.update_secret(v_secret_id, v_secret);
    update public.platform_credentials set
      hint = right(v_secret, 4),
      status = p_status,
      status_detail = p_status_detail,
      checked_at = case when p_status <> 'unchecked' then now() end,
      meta = coalesce(p_meta, '{}'::jsonb),
      updated_at = now(),
      updated_by = auth.uid()
    where provider = p_provider;
  end if;
end;
$$;
revoke execute on function public.set_platform_credential from public, anon;
grant execute on function public.set_platform_credential to authenticated;

create or replace function public.delete_platform_credential(p_provider text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'Platform admins only' using errcode = '42501';
  end if;
  delete from public.platform_credentials where provider = p_provider
  returning secret_id into v_secret_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;
revoke execute on function public.delete_platform_credential from public, anon;
grant execute on function public.delete_platform_credential to authenticated;

-- Jobs read the keys with the secret key, never a user request.
create or replace function public.platform_credentials_for_jobs()
returns table (provider text, secret text)
language sql stable security definer set search_path = ''
as $$
  select c.provider, s.decrypted_secret
  from public.platform_credentials c
  join vault.decrypted_secrets s on s.id = c.secret_id;
$$;
revoke execute on function public.platform_credentials_for_jobs from public, anon, authenticated;
grant execute on function public.platform_credentials_for_jobs to service_role;

-- ---------------------------------------------------------------------------
-- Cost centre: who pays a call, and the limits of what Pann pays.
-- ---------------------------------------------------------------------------
alter table public.usage_log
  add column billed_to text not null default 'workspace'
    check (billed_to in ('workspace', 'platform'));
create index usage_log_platform_month_idx on public.usage_log (created_at)
  where billed_to = 'platform';

create table public.platform_settings (
  id                    boolean primary key default true check (id),
  -- AI of the onboarding conversation, paid by Pann, per workspace.
  onboarding_credit_usd numeric(10, 2) not null default 0.50
    check (onboarding_credit_usd between 0 and 100),
  -- Everything Pann pays in a calendar month, all workspaces together.
  monthly_cap_usd       numeric(10, 2) not null default 20
    check (monthly_cap_usd between 0 and 100000),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users (id) on delete set null
);
create index platform_settings_updated_by_idx on public.platform_settings (updated_by);
insert into public.platform_settings (id) values (true);

alter table public.platform_settings enable row level security;
create policy "platform admins read settings" on public.platform_settings
  for select to authenticated using ((select private.is_platform_admin()));
create policy "platform admins update settings" on public.platform_settings
  for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));
revoke insert, delete on public.platform_settings from authenticated, anon;
grant update (onboarding_credit_usd, monthly_cap_usd, updated_at, updated_by)
  on public.platform_settings to authenticated;

-- Spending paid by Pann since p_from, per workspace, service and operation.
create or replace function public.platform_usage(p_from timestamptz, p_to timestamptz)
returns table (
  workspace_id uuid,
  workspace_name text,
  provider text,
  operation text,
  calls bigint,
  cost_usd numeric
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Platform admins only' using errcode = '42501';
  end if;
  return query
    select u.workspace_id, w.name, u.provider, coalesce(u.operation, ''), count(*), sum(u.cost_usd)
    from public.usage_log u
    join public.workspaces w on w.id = u.workspace_id
    where u.billed_to = 'platform' and u.created_at >= p_from and u.created_at < p_to
    group by u.workspace_id, w.name, u.provider, u.operation
    order by sum(u.cost_usd) desc;
end;
$$;
revoke execute on function public.platform_usage from public, anon;
grant execute on function public.platform_usage to authenticated;
