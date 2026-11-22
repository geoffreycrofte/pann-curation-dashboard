-- Posts that went out have the status 'sent' (post_status: draft, scheduled, sent, failed).
-- The admin costs per workspace counted 'published', not a value of the enum: the call
-- failed (500 in the admin space). Same function, the right status.

create or replace function public.platform_workspace_stats(p_from timestamptz, p_to timestamptz)
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
       where t.workspace_id = w.id and p.status = 'sent'
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
