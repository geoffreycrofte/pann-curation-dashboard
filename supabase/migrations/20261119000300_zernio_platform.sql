-- Zernio in platform mode (2026-11-19): for the workspaces a platform admin chooses
-- (later: the offers where Pann provides the services), the LinkedIn and Facebook
-- accounts go through Pann's own Zernio key, in a Zernio profile of their own
-- (externalId = workspace id). The workspace needs no Zernio key of its own.
--
-- Pann's key reaches every profile: a workspace may only publish to the accounts listed
-- in its own profile (checked by the publish job). The key is only used by jobs.

create table public.zernio_platform_links (
  workspace_id     uuid primary key references public.workspaces (id) on delete cascade,
  -- Set by a platform admin (admin space).
  enabled          boolean not null default false,
  -- Zernio profile of the workspace, created by the job on first use.
  profile_id       text,
  -- Accounts of that profile, listed by the job: [{ id, platform, username, active }].
  accounts         jsonb not null default '[]'::jsonb check (jsonb_typeof(accounts) = 'array'),
  refreshed_at     timestamptz,
  -- A connection or a refresh asked by a member, prepared by the job.
  status           text not null default 'idle' check (status in ('idle', 'pending', 'failed')),
  connect_platform text check (connect_platform in ('linkedin', 'facebook')),
  redirect_url     text check (redirect_url is null or char_length(redirect_url) <= 500),
  -- Zernio's authorization address for that connection, read once by the board.
  connect_url      text,
  error            text,
  updated_at       timestamptz not null default now()
);

alter table public.zernio_platform_links enable row level security;
create policy "members read their platform link" on public.zernio_platform_links
  for select to authenticated using ((select private.is_member(workspace_id)));
revoke insert, update, delete on public.zernio_platform_links from authenticated, anon;

-- Platform admins: turn the platform mode on or off for a workspace.
create or replace function public.set_zernio_platform(p_workspace_id uuid, p_enabled boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.zernio_platform_links (workspace_id, enabled)
  values (p_workspace_id, p_enabled)
  on conflict (workspace_id) do update set enabled = excluded.enabled, updated_at = now();
end;
$$;

-- Platform admins: the workspaces, and whether they use Pann's Zernio.
create or replace function public.admin_workspaces()
returns table (id uuid, name text, created_at timestamptz, zernio_platform boolean, accounts integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select w.id, w.name, w.created_at, coalesce(l.enabled, false),
           coalesce(jsonb_array_length(l.accounts), 0)
    from public.workspaces w
    left join public.zernio_platform_links l on l.workspace_id = w.id
    order by w.created_at desc;
end;
$$;

-- Members: ask the job to prepare a connection (a platform) or to list the accounts again
-- (no platform). Only for a workspace in platform mode.
create or replace function public.request_zernio_platform(
  p_workspace_id uuid,
  p_platform text,
  p_redirect_url text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_member(p_workspace_id) then
    raise exception 'Workspace not found' using errcode = '42501';
  end if;
  if p_platform is not null and p_platform not in ('linkedin', 'facebook') then
    raise exception 'Unknown platform' using errcode = '22023';
  end if;
  update public.zernio_platform_links
  set status = 'pending', connect_platform = p_platform, redirect_url = p_redirect_url,
      connect_url = null, error = null, updated_at = now()
  where workspace_id = p_workspace_id and enabled and status <> 'pending';
  return found;
end;
$$;

revoke execute on function public.set_zernio_platform from public, anon;
revoke execute on function public.admin_workspaces from public, anon;
revoke execute on function public.request_zernio_platform from public, anon;
grant execute on function public.set_zernio_platform to authenticated;
grant execute on function public.admin_workspaces to authenticated;
grant execute on function public.request_zernio_platform to authenticated;
