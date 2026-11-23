-- Glimr's Zernio follows the offer (2026-11-23): a workspace that pays the Intermediate or
-- Superior offer gets the platform mode (LinkedIn and Facebook without a Zernio key of its
-- own) as soon as the payment is recorded. The own-keys offer does not. A platform admin
-- keeps the hand: turning it off by hand (abuse) holds, whatever the offer, until turned on
-- again by hand.

alter table public.zernio_platform_links
  add column off_by_admin boolean not null default false;

-- Platform admins: turn the platform mode on or off; turning it off sticks.
create or replace function public.set_zernio_platform(p_workspace_id uuid, p_enabled boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.zernio_platform_links (workspace_id, enabled, off_by_admin)
  values (p_workspace_id, p_enabled, not p_enabled)
  on conflict (workspace_id) do update
    set enabled = excluded.enabled, off_by_admin = excluded.off_by_admin, updated_at = now();
end;
$$;

-- Jobs (Stripe webhook): the platform mode for the offers where Glimr provides the services,
-- unless an admin turned it off; none for the own-keys offer.
create or replace function private.sync_zernio_platform(p_workspace_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_plan text;
  v_status text;
begin
  select plan, billing_status into v_plan, v_status
  from public.workspaces where id = p_workspace_id;
  if v_plan in ('essential', 'pro') and v_status in ('active', 'past_due') then
    insert into public.zernio_platform_links (workspace_id, enabled)
    values (p_workspace_id, true)
    on conflict (workspace_id) do update set enabled = true, updated_at = now()
      where not public.zernio_platform_links.off_by_admin
        and not public.zernio_platform_links.enabled;
  elsif v_plan = 'own_keys' then
    update public.zernio_platform_links set enabled = false, updated_at = now()
    where workspace_id = p_workspace_id and enabled and not off_by_admin;
  end if;
end;
$$;
revoke execute on function private.sync_zernio_platform from public, anon, authenticated;

-- Same as 20261122000400, then the platform mode follows the offer.
create or replace function public.apply_billing_for_jobs(
  p_workspace_id uuid,
  p_status text,
  p_plan text,
  p_interval text,
  p_customer text,
  p_subscription text,
  p_period_end timestamptz,
  p_trial_end timestamptz default null
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
    trial_ends_at = case when p_status in ('active', 'past_due', 'canceled') then p_trial_end
      else trial_ends_at end
  where id = p_workspace_id;
  perform private.sync_zernio_platform(p_workspace_id);
  perform public.sync_billing_pauses_for_jobs();
end;
$$;
revoke execute on function public.apply_billing_for_jobs from public, anon, authenticated;
grant execute on function public.apply_billing_for_jobs to service_role;

-- Admin space: also says when the platform mode was turned off by hand (it then stays off).
drop function if exists public.admin_workspaces();

create function public.admin_workspaces()
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  zernio_platform boolean,
  zernio_off_by_admin boolean,
  accounts integer,
  owner_email text,
  plan text,
  plan_limits jsonb,
  billing_status text,
  billing_interval text,
  trial_ends_at timestamptz,
  current_period_end timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select w.id, w.name, w.created_at, coalesce(l.enabled, false), coalesce(l.off_by_admin, false),
           coalesce(jsonb_array_length(l.accounts), 0),
           (select u.email::text
              from public.workspace_members m
              join auth.users u on u.id = m.user_id
             where m.workspace_id = w.id and m.role = 'owner'
             order by m.created_at
             limit 1),
           w.plan, w.plan_limits, w.billing_status, w.billing_interval,
           w.trial_ends_at, w.current_period_end
    from public.workspaces w
    left join public.zernio_platform_links l on l.workspace_id = w.id
    order by w.created_at desc;
end;
$$;

revoke execute on function public.admin_workspaces from public, anon;
grant execute on function public.admin_workspaces to authenticated;
