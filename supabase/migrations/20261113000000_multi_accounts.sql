-- Pann: several accounts per network published directly (Bluesky, Mastodon, Discord),
-- chosen per topic in the diffusion settings. `account` names the account: the handle
-- (Bluesky), user@instance (Mastodon), the webhook id (Discord); '' for every other
-- service, which keeps one key per workspace.
alter table public.workspace_credentials add column account text not null default '';

-- The accounts set before: their identity from what was stored with them.
update public.workspace_credentials
  set account = coalesce(meta->>'acct', '')
  where provider = 'mastodon';
update public.workspace_credentials
  set account = coalesce(meta->>'handle', '')
  where provider = 'bluesky';
update public.workspace_credentials c
  set account = coalesce(substring(s.decrypted_secret from '/webhooks/([0-9]+)/'), '')
  from vault.decrypted_secrets s
  where s.id = c.secret_id and c.provider = 'discord';

-- Topics set with the single Discord webhook (account_id was its channel id) now name
-- the webhook itself, the account it is stored under.
update public.topics t
  set config = jsonb_set(
    t.config,
    '{channels}',
    (
      select jsonb_agg(
        case
          when e->>'channel' = 'discord' then jsonb_set(e, '{account_id}', to_jsonb(c.account))
          else e
        end
      )
      from jsonb_array_elements(t.config->'channels') e
    )
  )
  from public.workspace_credentials c
  where c.workspace_id = t.workspace_id
    and c.provider = 'discord'
    and c.account <> ''
    and jsonb_typeof(t.config->'channels') = 'array'
    and jsonb_array_length(t.config->'channels') > 0;

alter table public.workspace_credentials drop constraint workspace_credentials_pkey;
alter table public.workspace_credentials add primary key (workspace_id, provider, account);

-- ---------------------------------------------------------------------------
-- Setting a key: same checks as before, per account.
-- ---------------------------------------------------------------------------
drop function public.set_workspace_credential(uuid, text, text, text, text, jsonb);

create or replace function public.set_workspace_credential(
  p_workspace_id uuid,
  p_provider text,
  p_secret text,
  p_status text default 'unchecked',
  p_status_detail text default null,
  p_meta jsonb default '{}'::jsonb,
  p_account text default ''
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret text := trim(p_secret);
  v_secret_id uuid;
  v_account text := coalesce(trim(p_account), '');
begin
  if not private.is_owner(p_workspace_id) then
    raise exception 'Only workspace owners can manage credentials' using errcode = '42501';
  end if;
  if p_provider not in ('anthropic', 'exa', 'github', 'zernio', 'mastodon', 'bluesky', 'discord', 'brevo', 'sendfox') then
    raise exception 'Unknown provider' using errcode = '22023';
  end if;
  if length(v_secret) < 8 or length(v_secret) > 500 then
    raise exception 'Invalid key' using errcode = '22023';
  end if;
  if p_status not in ('unchecked', 'ok', 'invalid') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_meta, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid meta' using errcode = '22023';
  end if;

  -- Several accounts only for the networks published directly.
  if v_account <> '' and p_provider not in ('mastodon', 'bluesky', 'discord') then
    raise exception 'One key per service' using errcode = '22023';
  end if;
  if length(v_account) > 300 then
    raise exception 'Invalid account' using errcode = '22023';
  end if;

  select c.secret_id into v_secret_id
  from public.workspace_credentials c
  where c.workspace_id = p_workspace_id and c.provider = p_provider and c.account = v_account;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      v_secret,
      'pann/' || p_workspace_id || '/' || p_provider
        || case when v_account <> '' then '/' || v_account else '' end,
      'Pann workspace credential'
    );
    insert into public.workspace_credentials
      (workspace_id, provider, account, secret_id, hint, status, status_detail, checked_at, updated_by, meta)
    values (
      p_workspace_id, p_provider, v_account, v_secret_id, right(v_secret, 4), p_status, p_status_detail,
      case when p_status <> 'unchecked' then now() end, auth.uid(), coalesce(p_meta, '{}'::jsonb)
    );
  else
    perform vault.update_secret(v_secret_id, v_secret);
    update public.workspace_credentials set
      hint = right(v_secret, 4),
      status = p_status,
      status_detail = p_status_detail,
      checked_at = case when p_status <> 'unchecked' then now() end,
      updated_at = now(),
      updated_by = auth.uid(),
      meta = coalesce(p_meta, '{}'::jsonb)
    where workspace_id = p_workspace_id and provider = p_provider and account = v_account;
  end if;
end;
$$;

revoke execute on function public.set_workspace_credential from public, anon;
grant execute on function public.set_workspace_credential to authenticated;

-- ---------------------------------------------------------------------------
-- Removing a key: one account at a time.
-- ---------------------------------------------------------------------------
drop function public.delete_workspace_credential(uuid, text);

create function public.delete_workspace_credential(
  p_workspace_id uuid,
  p_provider text,
  p_account text default ''
)
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
    and account = coalesce(p_account, '')
  returning secret_id into v_secret_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

revoke execute on function public.delete_workspace_credential from public, anon;
grant execute on function public.delete_workspace_credential to authenticated;

-- ---------------------------------------------------------------------------
-- Jobs: the decrypted keys of a workspace, with their account.
-- ---------------------------------------------------------------------------
drop function public.workspace_credentials_for_jobs(uuid);

create function public.workspace_credentials_for_jobs(p_workspace_id uuid)
returns table (provider text, account text, secret text)
language sql stable security definer set search_path = ''
as $$
  select c.provider, c.account, s.decrypted_secret
  from public.workspace_credentials c
  join vault.decrypted_secrets s on s.id = c.secret_id
  where c.workspace_id = p_workspace_id;
$$;

revoke execute on function public.workspace_credentials_for_jobs from public, anon, authenticated;
grant execute on function public.workspace_credentials_for_jobs to service_role;
