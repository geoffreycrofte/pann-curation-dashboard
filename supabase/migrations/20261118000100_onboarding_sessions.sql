-- Onboarding conversation (2026-11-18): while creating a topic, a short exchange with an
-- assistant proposes its settings. It runs on Pann's own Anthropic key (admin space),
-- within the onboarding credit per workspace and Pann's monthly cap (cost centre).
-- Same pattern as rewrites: the request stores the message, a job answers on the row.

create table public.onboarding_sessions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  -- What the earlier steps said (name, site, tools, networks): never asked again.
  context      jsonb not null default '{}'::jsonb,
  -- [{ role: 'user' | 'assistant', text, quick_replies? }]
  messages     jsonb not null default '[]'::jsonb,
  -- Settings proposed so far (part of a topic config), shown at the review step.
  proposal     jsonb not null default '{}'::jsonb,
  status       text not null default 'pending' check (status in ('pending', 'idle', 'done', 'failed')),
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Kept a week: coming back to "New topic" can resume it.
  expires_at   timestamptz not null default now() + interval '7 days'
);
create index onboarding_sessions_workspace_idx on public.onboarding_sessions (workspace_id);
create index onboarding_sessions_user_idx on public.onboarding_sessions (user_id, created_at desc);

alter table public.onboarding_sessions enable row level security;

-- A person sees and writes their own sessions, in a workspace they belong to. The job
-- (secret key) writes the answers.
create policy "own onboarding sessions" on public.onboarding_sessions
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_member(workspace_id)))
  with check (user_id = (select auth.uid()) and (select private.is_member(workspace_id)));
revoke delete on public.onboarding_sessions from authenticated, anon;

-- What Pann already spent: on the onboarding of one workspace, and in the current month.
create or replace function private.platform_spend(p_workspace_id uuid)
returns table (workspace_onboarding numeric, month_total numeric)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce(sum(cost_usd) filter (
      where workspace_id = p_workspace_id and operation = 'onboarding'
    ), 0),
    coalesce(sum(cost_usd) filter (
      where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
    ), 0)
  from public.usage_log
  where billed_to = 'platform';
$$;

-- Whether the conversation can run for this workspace: Pann's key is set, and neither
-- the onboarding credit of the workspace nor Pann's monthly cap is reached. Members only.
create or replace function public.onboarding_available(p_workspace_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_spend record;
  v_settings record;
begin
  if not private.is_member(p_workspace_id) then
    return false;
  end if;
  if not exists (
    select 1 from public.platform_credentials where provider = 'anthropic' and status <> 'invalid'
  ) then
    return false;
  end if;
  select onboarding_credit_usd, monthly_cap_usd into v_settings from public.platform_settings;
  select * into v_spend from private.platform_spend(p_workspace_id);
  return v_spend.workspace_onboarding < v_settings.onboarding_credit_usd
    and v_spend.month_total < v_settings.monthly_cap_usd;
end;
$$;
revoke execute on function public.onboarding_available from public, anon;
grant execute on function public.onboarding_available to authenticated;

-- The job checks the same limits with the secret key before each call.
create or replace function public.onboarding_budget(p_workspace_id uuid)
returns table (workspace_onboarding numeric, month_total numeric, credit numeric, cap numeric)
language sql stable security definer set search_path = ''
as $$
  select s.workspace_onboarding, s.month_total, p.onboarding_credit_usd, p.monthly_cap_usd
  from private.platform_spend(p_workspace_id) s, public.platform_settings p;
$$;
revoke execute on function public.onboarding_budget from public, anon, authenticated;
grant execute on function public.onboarding_budget to service_role;
