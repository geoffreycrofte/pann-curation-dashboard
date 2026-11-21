-- Offers (2026-11-21). Each workspace has a plan; a plan sets how many topics it may hold
-- and whether Pann provides the AI and the search, up to a monthly quota of weighted tokens.
-- Prices and payment come later (Stripe): for now the admin space sets a workspace's plan.
--
-- Weighted tokens: what a call cost, at $2 per million tokens (the input price of the
-- drafting model). A drafting token counts more than a triage token, as it costs more; the
-- person only ever sees tokens on the plans where Pann provides the AI, never dollars.

create table public.plans (
  key                 text primary key check (key in ('own_keys', 'essential', 'pro', 'custom')),
  -- Null: no limit.
  max_topics          integer check (max_topics > 0),
  -- LinkedIn and Facebook accounts published through Zernio (not enforced yet).
  max_social_accounts integer check (max_social_accounts > 0),
  -- Weighted tokens Pann provides each month. Null: the workspace brings its own keys.
  monthly_tokens      bigint check (monthly_tokens > 0),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id) on delete set null
);
create index plans_updated_by_idx on public.plans (updated_by);

insert into public.plans (key, max_topics, max_social_accounts, monthly_tokens) values
  ('own_keys', 2, null, null),
  ('essential', 3, 3, 5000000),
  ('pro', 5, 6, 15000000),
  -- Set per workspace (workspaces.plan_limits).
  ('custom', null, null, null);

alter table public.plans enable row level security;
-- The offers are public to signed-in people (the board shows them); admins tune them.
create policy "signed in read plans" on public.plans
  for select to authenticated using (true);
create policy "platform admins update plans" on public.plans
  for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));
revoke insert, delete on public.plans from authenticated, anon;
grant update (max_topics, max_social_accounts, monthly_tokens, updated_at, updated_by)
  on public.plans to authenticated;

-- Existing workspaces bring their own keys, as before.
alter table public.workspaces
  add column plan text not null default 'own_keys' references public.plans (key),
  -- "custom" plan: the limits negotiated for this workspace, same keys as public.plans.
  add column plan_limits jsonb not null default '{}'::jsonb;
create index workspaces_plan_idx on public.workspaces (plan);

-- Owners rename their workspace; the plan is set by Pann (admin space, later payment).
revoke update on public.workspaces from authenticated;
grant update (name) on public.workspaces to authenticated;

create or replace function public.set_workspace_plan(
  p_workspace_id uuid,
  p_plan text,
  p_limits jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Platform admins only' using errcode = '42501';
  end if;
  update public.workspaces
  set plan = p_plan, plan_limits = case when p_plan = 'custom' then p_limits else '{}'::jsonb end
  where id = p_workspace_id;
  if not found then
    raise exception 'Workspace not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.set_workspace_plan from public, anon;
grant execute on function public.set_workspace_plan to authenticated;

-- ---------------------------------------------------------------------------
-- Limits and consumption of a workspace.
-- ---------------------------------------------------------------------------
create or replace function private.cost_to_tokens(p_cost numeric)
returns bigint
language sql immutable set search_path = ''
as $$ select round(p_cost * 500000)::bigint $$;

create or replace function private.workspace_limits(p_workspace_id uuid)
returns table (plan text, max_topics integer, max_social_accounts integer, monthly_tokens bigint)
language sql stable security definer set search_path = ''
as $$
  select w.plan,
    case when w.plan = 'custom' then (w.plan_limits ->> 'max_topics')::integer else p.max_topics end,
    case when w.plan = 'custom' then (w.plan_limits ->> 'max_social_accounts')::integer
      else p.max_social_accounts end,
    case when w.plan = 'custom' then (w.plan_limits ->> 'monthly_tokens')::bigint
      else p.monthly_tokens end
  from public.workspaces w
  join public.plans p on p.key = w.plan
  where w.id = p_workspace_id;
$$;

-- Weighted tokens Pann provided to the workspace this calendar month (UTC).
create or replace function private.workspace_month_tokens(p_workspace_id uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select private.cost_to_tokens(coalesce(sum(u.cost_usd), 0))
  from public.usage_log u
  where u.workspace_id = p_workspace_id
    and u.billed_to = 'platform'
    and u.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
$$;

-- For the board: the plan of a workspace, its limits and what it used (members only).
create or replace function public.workspace_plan(p_workspace_id uuid)
returns table (
  plan text,
  max_topics integer,
  max_social_accounts integer,
  monthly_tokens bigint,
  topics bigint,
  month_tokens bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_member(p_workspace_id) then
    raise exception 'Not a member' using errcode = '42501';
  end if;
  return query
    select l.plan, l.max_topics, l.max_social_accounts, l.monthly_tokens,
      (select count(*) from public.topics t where t.workspace_id = p_workspace_id),
      private.workspace_month_tokens(p_workspace_id)
    from private.workspace_limits(p_workspace_id) l;
end;
$$;
revoke execute on function public.workspace_plan from public, anon;
grant execute on function public.workspace_plan to authenticated;

-- ---------------------------------------------------------------------------
-- Topics: no more than the plan allows.
-- ---------------------------------------------------------------------------
create or replace function private.check_topic_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_max integer;
begin
  select l.max_topics into v_max from private.workspace_limits(new.workspace_id) l;
  -- Serialise concurrent creations in one workspace.
  perform 1 from public.workspaces w where w.id = new.workspace_id for update;
  if v_max is not null
     and (select count(*) from public.topics t where t.workspace_id = new.workspace_id) >= v_max then
    raise exception 'plan_topic_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger topics_plan_limit
  before insert on public.topics
  for each row execute function private.check_topic_limit();

-- ---------------------------------------------------------------------------
-- Pann provides the AI and the search on plans with a token quota.
-- ---------------------------------------------------------------------------
-- Exa joins Pann's own keys.
alter table public.platform_credentials
  drop constraint platform_credentials_provider_check,
  add constraint platform_credentials_provider_check
    check (provider in ('anthropic', 'zernio', 'resend', 'exa'));

-- Services Pann provides with a token quota.
create or replace function private.provided_services()
returns text[]
language sql immutable set search_path = ''
as $$ select array['anthropic', 'exa'] $$;

-- Whether Pann can still pay for this workspace: within its quota, and within the
-- monthly cap of everything Pann pays (admin space).
create or replace function public.workspace_provided_status_for_jobs(p_workspace_id uuid)
returns table (provided boolean, available boolean)
language sql stable security definer set search_path = ''
as $$
  select
    l.monthly_tokens is not null,
    l.monthly_tokens is not null
      and private.workspace_month_tokens(p_workspace_id) < l.monthly_tokens
      and (
        select coalesce(sum(u.cost_usd), 0) from public.usage_log u
        where u.billed_to = 'platform'
          and u.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
      ) < (select s.monthly_cap_usd from public.platform_settings s)
  from private.workspace_limits(p_workspace_id) l;
$$;
revoke execute on function public.workspace_provided_status_for_jobs from public, anon, authenticated;
grant execute on function public.workspace_provided_status_for_jobs to service_role;

-- Jobs: the keys of a workspace. On a plan where Pann provides a service, Pann's key
-- replaces the workspace's for it, while the quota lasts; past it, no key for that service.
drop function public.workspace_credentials_for_jobs(uuid);

create function public.workspace_credentials_for_jobs(p_workspace_id uuid)
returns table (provider text, account text, secret text)
language sql stable security definer set search_path = ''
as $$
  with status as (
    select * from public.workspace_provided_status_for_jobs(p_workspace_id)
  )
  select c.provider, c.account, s.decrypted_secret
  from public.workspace_credentials c
  join vault.decrypted_secrets s on s.id = c.secret_id
  where c.workspace_id = p_workspace_id
    and not (
      c.provider = any (private.provided_services())
      and coalesce((select st.provided from status st), false)
    )
  union all
  select pc.provider, '', s.decrypted_secret
  from public.platform_credentials pc
  join vault.decrypted_secrets s on s.id = pc.secret_id
  where pc.provider = any (private.provided_services())
    and coalesce((select st.available from status st), false);
$$;

revoke execute on function public.workspace_credentials_for_jobs from public, anon, authenticated;
grant execute on function public.workspace_credentials_for_jobs to service_role;

-- What a provided service costs is billed to Pann, whoever logs it.
create or replace function private.bill_provided_usage()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.billed_to = 'workspace'
     and new.provider = any (private.provided_services())
     and exists (
       select 1 from private.workspace_limits(new.workspace_id) l where l.monthly_tokens is not null
     ) then
    new.billed_to := 'platform';
  end if;
  return new;
end;
$$;

create trigger usage_log_billing
  before insert on public.usage_log
  for each row execute function private.bill_provided_usage();

-- ---------------------------------------------------------------------------
-- Admin: the plan of each workspace next to its costs.
-- ---------------------------------------------------------------------------
drop function public.platform_workspace_stats(timestamptz, timestamptz);

create function public.platform_workspace_stats(p_from timestamptz, p_to timestamptz)
returns table (
  workspace_id uuid,
  workspace_name text,
  plan text,
  plan_limits jsonb,
  topics bigint,
  calls bigint,
  cost_usd numeric,
  platform_cost_usd numeric,
  posts_drafted bigint,
  posts_published bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Platform admins only' using errcode = '42501';
  end if;
  return query
    select
      w.id,
      w.name,
      w.plan,
      w.plan_limits,
      (select count(*) from public.topics t where t.workspace_id = w.id),
      coalesce(u.calls, 0),
      coalesce(u.cost_usd, 0),
      coalesce(u.platform_cost_usd, 0),
      (select count(*) from public.posts p join public.topics t on t.id = p.topic_id
       where t.workspace_id = w.id and p.created_at >= p_from and p.created_at < p_to),
      (select count(*) from public.posts p join public.topics t on t.id = p.topic_id
       where t.workspace_id = w.id and p.status = 'published'
         and p.sent_at >= p_from and p.sent_at < p_to)
    from public.workspaces w
    left join (
      select ul.workspace_id,
        count(*) as calls,
        sum(ul.cost_usd) as cost_usd,
        sum(ul.cost_usd) filter (where ul.billed_to = 'platform') as platform_cost_usd
      from public.usage_log ul
      where ul.created_at >= p_from and ul.created_at < p_to
      group by ul.workspace_id
    ) u on u.workspace_id = w.id
    order by coalesce(u.cost_usd, 0) desc, w.name;
end;
$$;

revoke execute on function public.platform_workspace_stats from public, anon;
grant execute on function public.platform_workspace_stats to authenticated;
