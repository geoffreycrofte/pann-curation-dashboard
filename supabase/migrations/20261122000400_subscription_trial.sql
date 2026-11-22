-- Paying during the trial keeps its remaining days (2026-11-22): the subscription is
-- active, but Stripe takes the first payment only at the trial's end. Its date is kept in
-- trial_ends_at, so the board says "subscribed, trial until…" instead of "paid until…".
drop function if exists public.apply_billing_for_jobs(uuid, text, text, text, text, text, timestamptz);

create function public.apply_billing_for_jobs(
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
    -- Subscribed: the end of Stripe's trial if one runs, none otherwise.
    trial_ends_at = case when p_status in ('active', 'past_due', 'canceled') then p_trial_end
      else trial_ends_at end
  where id = p_workspace_id;
  perform public.sync_billing_pauses_for_jobs();
end;
$$;
revoke execute on function public.apply_billing_for_jobs from public, anon, authenticated;
grant execute on function public.apply_billing_for_jobs to service_role;
