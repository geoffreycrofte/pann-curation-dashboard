-- The assistant beyond its credit (decided 2026-11-18, done 2026-11-23). The onboarding
-- credit, paid by Glimr, comes first; once it is used up, the assistant ("Adjust with the
-- assistant", a new topic) runs on the workspace's own AI: its own Anthropic key (own-keys
-- offer) or the tokens of its offer (offers where Glimr provides the AI). Before, the button
-- disappeared.

-- Whether the workspace's own AI can answer: a running workspace, with its Anthropic key,
-- or with tokens left on an offer where Glimr provides the AI.
create or replace function private.workspace_ai_available(p_workspace_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.workspace_active(p_workspace_id)
    and coalesce((
      select case
        when st.provided then st.available
        else exists (
          select 1 from public.workspace_credentials c
          where c.workspace_id = p_workspace_id and c.provider = 'anthropic'
            and c.status <> 'invalid'
        )
      end
      from public.workspace_provided_status_for_jobs(p_workspace_id) st
    ), false);
$$;
revoke execute on function private.workspace_ai_available from public, anon, authenticated;

-- Members: whether the assistant can run, on Glimr's credit or on the workspace's own AI.
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
  if exists (
    select 1 from public.platform_credentials where provider = 'anthropic' and status <> 'invalid'
  ) then
    select onboarding_credit_usd, monthly_cap_usd into v_settings from public.platform_settings;
    select * into v_spend from private.platform_spend(p_workspace_id);
    if v_spend.workspace_onboarding < v_settings.onboarding_credit_usd
       and v_spend.month_total < v_settings.monthly_cap_usd then
      return true;
    end if;
  end if;
  return private.workspace_ai_available(p_workspace_id);
end;
$$;
