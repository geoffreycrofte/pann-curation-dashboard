-- Billing (2026-11-22). Decisions of Geoffrey: prices of the offers (2 € a month on the
-- own-keys offer, yearly only; 19 € or 15 € a month yearly; 49 € or 39 € a month yearly);
-- a 14-day trial on the chosen offer, then the workspace pays to go on; during a trial of
-- an offer where Pann provides the AI, a reduced token quota.
--
-- Payment goes through Stripe Checkout; Stripe's webhook sets the plan and the status.
-- When a trial ends unpaid or a subscription stops, the workspace's topics are paused (the
-- pause already stops collection, triage, drafting and publishing) and resume on payment.

-- ---------------------------------------------------------------------------
-- Prices and Stripe prices of each offer (admin space).
-- ---------------------------------------------------------------------------
alter table public.plans
  -- Euros, taxes included. Null: not sold that way (own keys: yearly only; custom: quote).
  add column price_month_eur numeric(10, 2) check (price_month_eur >= 0),
  add column price_year_eur numeric(10, 2) check (price_year_eur >= 0),
  -- Stripe Price ids (price_…), set once the products exist in Stripe.
  add column stripe_price_month text not null default '',
  add column stripe_price_year text not null default '',
  -- Tokens of the trial, on offers where Pann provides the AI.
  add column trial_tokens bigint check (trial_tokens > 0);

update public.plans set price_month_eur = null, price_year_eur = 24 where key = 'own_keys';
update public.plans set price_month_eur = 19, price_year_eur = 180, trial_tokens = 1000000
  where key = 'essential';
update public.plans set price_month_eur = 49, price_year_eur = 468, trial_tokens = 1000000
  where key = 'pro';

grant update (price_month_eur, price_year_eur, stripe_price_month, stripe_price_year, trial_tokens)
  on public.plans to authenticated;
-- The offers and their prices are public (pricing page).
grant select on public.plans to anon;
create policy "anyone reads plans" on public.plans for select to anon using (true);

-- ---------------------------------------------------------------------------
-- Billing state of a workspace.
-- ---------------------------------------------------------------------------
alter table public.workspaces
  -- legacy: created before billing, keeps its access until Pann decides.
  add column billing_status text not null default 'trialing'
    check (billing_status in ('legacy', 'trialing', 'active', 'past_due', 'canceled', 'expired')),
  add column trial_ends_at timestamptz default (now() + interval '14 days'),
  -- When the person chose the offer of the trial (onboarding or Profile).
  add column plan_chosen_at timestamptz,
  add column billing_interval text check (billing_interval in ('month', 'year')),
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column current_period_end timestamptz;
create unique index workspaces_stripe_customer_idx on public.workspaces (stripe_customer_id)
  where stripe_customer_id is not null;

update public.workspaces set billing_status = 'legacy', trial_ends_at = null;

-- A topic paused because the workspace does not pay resumes on payment; one the person
-- paused stays paused.
alter table public.topics add column paused_by_billing boolean not null default false;

-- Whether the workspace may run (collect, triage, draft, publish, create topics).
create or replace function private.workspace_active(p_workspace_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case w.billing_status
    when 'legacy' then true
    when 'active' then true
    -- Stripe retries a failed payment for a while: keep the workspace running meanwhile.
    when 'past_due' then true
    when 'trialing' then coalesce(w.trial_ends_at > now(), false)
    -- Canceled: runs until the end of the paid period.
    when 'canceled' then coalesce(w.current_period_end > now(), false)
    else false
  end
  from public.workspaces w where w.id = p_workspace_id;
$$;

-- The trial quota replaces the monthly one while the workspace is trialing.
create or replace function private.workspace_limits(p_workspace_id uuid)
returns table (plan text, max_topics integer, max_social_accounts integer, monthly_tokens bigint)
language sql stable security definer set search_path = ''
as $$
  select w.plan,
    case when w.plan = 'custom' then (w.plan_limits ->> 'max_topics')::integer else p.max_topics end,
    case when w.plan = 'custom' then (w.plan_limits ->> 'max_social_accounts')::integer
      else p.max_social_accounts end,
    case
      when w.plan = 'custom' then (w.plan_limits ->> 'monthly_tokens')::bigint
      when w.billing_status = 'trialing' and p.monthly_tokens is not null
        then least(p.monthly_tokens, coalesce(p.trial_tokens, p.monthly_tokens))
      else p.monthly_tokens
    end
  from public.workspaces w
  join public.plans p on p.key = w.plan
  where w.id = p_workspace_id;
$$;

-- No AI from Pann for a workspace that does not run.
create or replace function public.workspace_provided_status_for_jobs(p_workspace_id uuid)
returns table (provided boolean, available boolean)
language sql stable security definer set search_path = ''
as $$
  select
    l.monthly_tokens is not null,
    l.monthly_tokens is not null
      and private.workspace_active(p_workspace_id)
      and private.workspace_month_tokens(p_workspace_id) < l.monthly_tokens
      and (
        select coalesce(sum(u.cost_usd), 0) from public.usage_log u
        where u.billed_to = 'platform'
          and u.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
      ) < (select s.monthly_cap_usd from public.platform_settings s)
  from private.workspace_limits(p_workspace_id) l;
$$;

-- No new topic for a workspace that does not run.
create or replace function private.check_topic_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_max integer;
begin
  perform 1 from public.workspaces w where w.id = new.workspace_id for update;
  if not private.workspace_active(new.workspace_id) then
    raise exception 'billing_inactive' using errcode = 'P0001';
  end if;
  select l.max_topics into v_max from private.workspace_limits(new.workspace_id) l;
  if v_max is not null
     and (select count(*) from public.topics t where t.workspace_id = new.workspace_id) >= v_max then
    raise exception 'plan_topic_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- For the board: the plan, its limits, the billing state and what was used.
drop function public.workspace_plan(uuid);
create function public.workspace_plan(p_workspace_id uuid)
returns table (
  plan text,
  max_topics integer,
  max_social_accounts integer,
  monthly_tokens bigint,
  topics bigint,
  month_tokens bigint,
  billing_status text,
  trial_ends_at timestamptz,
  plan_chosen_at timestamptz,
  billing_interval text,
  current_period_end timestamptz,
  active boolean,
  subscribed boolean
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
      private.workspace_month_tokens(p_workspace_id),
      w.billing_status, w.trial_ends_at, w.plan_chosen_at, w.billing_interval,
      w.current_period_end,
      private.workspace_active(p_workspace_id),
      w.stripe_subscription_id is not null
    from private.workspace_limits(p_workspace_id) l
    cross join public.workspaces w
    where w.id = p_workspace_id;
end;
$$;
revoke execute on function public.workspace_plan from public, anon;
grant execute on function public.workspace_plan to authenticated;

-- The owner picks the offer of the trial (not the custom one, negotiated with Pann). Once
-- the workspace pays, the offer changes through Stripe.
create or replace function public.choose_trial_plan(p_workspace_id uuid, p_plan text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_owner(p_workspace_id) then
    raise exception 'Owners only' using errcode = '42501';
  end if;
  if p_plan not in ('own_keys', 'essential', 'pro') then
    raise exception 'Unknown plan' using errcode = '22023';
  end if;
  update public.workspaces
  set plan = p_plan, plan_chosen_at = now()
  where id = p_workspace_id and billing_status in ('trialing', 'legacy', 'expired')
    and stripe_subscription_id is null;
  if not found then
    raise exception 'subscribed' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.choose_trial_plan from public, anon;
grant execute on function public.choose_trial_plan to authenticated;

-- ---------------------------------------------------------------------------
-- Payment requests: the person asks, a job opens the Stripe page with Pann's key.
-- ---------------------------------------------------------------------------
create table public.billing_requests (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- checkout: subscribe to an offer; portal: manage the subscription (card, invoices, stop).
  kind         text not null check (kind in ('checkout', 'portal')),
  plan         text references public.plans (key),
  billing_interval text check (billing_interval in ('month', 'year')),
  -- Where Stripe sends the person back (the board's address).
  return_url   text not null check (return_url ~ '^https?://'),
  status       text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  url          text,
  error        text,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  check (kind = 'portal' or (plan in ('own_keys', 'essential', 'pro') and billing_interval is not null))
);
create index billing_requests_workspace_idx on public.billing_requests (workspace_id, created_at);
create index billing_requests_created_by_idx on public.billing_requests (created_by);

alter table public.billing_requests enable row level security;
-- Only the owner pays; members see nothing of it.
create policy "owners create billing requests" on public.billing_requests
  for insert to authenticated with check ((select private.is_owner(workspace_id)));
create policy "owners read billing requests" on public.billing_requests
  for select to authenticated using ((select private.is_owner(workspace_id)));
revoke update, delete on public.billing_requests from authenticated, anon;

-- Stripe's keys join Pann's: the secret key and the webhook signing secret.
alter table public.platform_credentials
  drop constraint platform_credentials_provider_check,
  add constraint platform_credentials_provider_check
    check (provider in ('anthropic', 'zernio', 'resend', 'exa', 'stripe', 'stripe_webhook'));

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
  if p_provider not in ('anthropic', 'zernio', 'resend', 'exa', 'stripe', 'stripe_webhook') then
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

-- ---------------------------------------------------------------------------
-- Jobs: apply what Stripe says, and stop the workspaces that no longer run.
-- ---------------------------------------------------------------------------
create or replace function public.apply_billing_for_jobs(
  p_workspace_id uuid,
  p_status text,
  p_plan text,
  p_interval text,
  p_customer text,
  p_subscription text,
  p_period_end timestamptz
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.workspaces set
    billing_status = p_status,
    plan = coalesce(p_plan, plan),
    plan_chosen_at = coalesce(plan_chosen_at, now()),
    billing_interval = coalesce(p_interval, billing_interval),
    stripe_customer_id = coalesce(p_customer, stripe_customer_id),
    stripe_subscription_id = case when p_status = 'expired' then null
      else coalesce(p_subscription, stripe_subscription_id) end,
    current_period_end = coalesce(p_period_end, current_period_end),
    trial_ends_at = case when p_status in ('active', 'past_due') then null else trial_ends_at end
  where id = p_workspace_id;
  perform public.sync_billing_pauses_for_jobs();
end;
$$;
revoke execute on function public.apply_billing_for_jobs from public, anon, authenticated;
grant execute on function public.apply_billing_for_jobs to service_role;

-- Pauses the topics of workspaces that no longer run, resumes those paused for that reason
-- once the workspace runs again. Hourly, and after every Stripe event.
create or replace function public.sync_billing_pauses_for_jobs()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.workspaces set billing_status = 'expired'
  where billing_status in ('trialing', 'canceled') and not private.workspace_active(id);

  update public.topics t set active = false, paused_by_billing = true
  where t.active and not private.workspace_active(t.workspace_id);

  update public.topics t set active = true, paused_by_billing = false
  where t.paused_by_billing and private.workspace_active(t.workspace_id);
end;
$$;
revoke execute on function public.sync_billing_pauses_for_jobs from public, anon, authenticated;
grant execute on function public.sync_billing_pauses_for_jobs to service_role;

-- The owner can't resume a topic paused for billing: it resumes on payment.
-- Runs as the caller: a person (authenticated) is checked, the jobs are not.
create or replace function private.check_billing_resume()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.active and not old.active and current_user = 'authenticated'
     and not private.workspace_active(new.workspace_id) then
    raise exception 'billing_inactive' using errcode = 'P0001';
  end if;
  if new.active then
    new.paused_by_billing := false;
  end if;
  return new;
end;
$$;

create trigger topics_billing_resume
  before update of active on public.topics
  for each row execute function private.check_billing_resume();
