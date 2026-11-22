-- Admin space (2026-11-22): the workspaces list also says who owns each one (two workspaces
-- can share a name, taken from the start of the e-mail address), its offer and where its
-- billing stands (trial and its end, subscription, period end).
drop function if exists public.admin_workspaces();

create function public.admin_workspaces()
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  zernio_platform boolean,
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
    select w.id, w.name, w.created_at, coalesce(l.enabled, false),
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
