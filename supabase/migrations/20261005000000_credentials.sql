-- Pann: service credentials per workspace, set from the board (Connections page).
-- Secrets live in Supabase Vault (encrypted at rest). The board never reads them
-- back: it only sees the provider, the last 4 characters and the check status.

create table public.workspace_credentials (
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  provider      text not null check (provider in ('anthropic', 'exa', 'github')),
  secret_id     uuid not null,   -- vault.secrets.id
  hint          text not null,   -- last 4 characters, for display
  status        text not null default 'unchecked' check (status in ('unchecked', 'ok', 'invalid')),
  status_detail text,
  checked_at    timestamptz,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  primary key (workspace_id, provider)
);
create index workspace_credentials_updated_by_idx on public.workspace_credentials (updated_by);

alter table public.workspace_credentials enable row level security;

-- Members see which services are connected; writes go through the functions below.
create policy "members read credentials status" on public.workspace_credentials
  for select to authenticated using (private.is_member(workspace_id));
revoke insert, update, delete on public.workspace_credentials from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Owners set or replace a credential. The API checks the key with the provider
-- first and passes the result as p_status.
-- ---------------------------------------------------------------------------
create or replace function public.set_workspace_credential(
  p_workspace_id uuid,
  p_provider text,
  p_secret text,
  p_status text default 'unchecked',
  p_status_detail text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret text := trim(p_secret);
  v_secret_id uuid;
begin
  if not private.is_owner(p_workspace_id) then
    raise exception 'Only workspace owners can manage credentials' using errcode = '42501';
  end if;
  if p_provider not in ('anthropic', 'exa', 'github') then
    raise exception 'Unknown provider' using errcode = '22023';
  end if;
  if length(v_secret) < 8 or length(v_secret) > 500 then
    raise exception 'Invalid key' using errcode = '22023';
  end if;
  if p_status not in ('unchecked', 'ok', 'invalid') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  select c.secret_id into v_secret_id
  from public.workspace_credentials c
  where c.workspace_id = p_workspace_id and c.provider = p_provider;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      v_secret, 'pann/' || p_workspace_id || '/' || p_provider, 'Pann workspace credential'
    );
    insert into public.workspace_credentials
      (workspace_id, provider, secret_id, hint, status, status_detail, checked_at, updated_by)
    values (
      p_workspace_id, p_provider, v_secret_id, right(v_secret, 4), p_status, p_status_detail,
      case when p_status <> 'unchecked' then now() end, auth.uid()
    );
  else
    perform vault.update_secret(v_secret_id, v_secret);
    update public.workspace_credentials set
      hint = right(v_secret, 4),
      status = p_status,
      status_detail = p_status_detail,
      checked_at = case when p_status <> 'unchecked' then now() end,
      updated_at = now(),
      updated_by = auth.uid()
    where workspace_id = p_workspace_id and provider = p_provider;
  end if;
end;
$$;

create or replace function public.delete_workspace_credential(p_workspace_id uuid, p_provider text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if not private.is_owner(p_workspace_id) then
    raise exception 'Only workspace owners can manage credentials' using errcode = '42501';
  end if;
  delete from public.workspace_credentials
  where workspace_id = p_workspace_id and provider = p_provider
  returning secret_id into v_secret_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

revoke execute on function public.set_workspace_credential from public, anon;
revoke execute on function public.delete_workspace_credential from public, anon;
grant execute on function public.set_workspace_credential to authenticated;
grant execute on function public.delete_workspace_credential to authenticated;

-- ---------------------------------------------------------------------------
-- Jobs only: decrypted credentials of a workspace.
-- ---------------------------------------------------------------------------
create or replace function public.workspace_credentials_for_jobs(p_workspace_id uuid)
returns table (provider text, secret text)
language sql stable security definer set search_path = ''
as $$
  select c.provider, s.decrypted_secret
  from public.workspace_credentials c
  join vault.decrypted_secrets s on s.id = c.secret_id
  where c.workspace_id = p_workspace_id;
$$;

revoke execute on function public.workspace_credentials_for_jobs from public, anon, authenticated;
grant execute on function public.workspace_credentials_for_jobs to service_role;

-- ---------------------------------------------------------------------------
-- Outcome of the last collection, shown on the Sources page.
-- ---------------------------------------------------------------------------
alter table public.sources add column last_run_stats jsonb;
