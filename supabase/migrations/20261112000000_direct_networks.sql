-- Pann: Bluesky and Discord published directly, without Zernio. Bluesky's key is an app
-- password (meta: handle, DID, PDS); Discord's is the webhook address of a channel
-- (meta: webhook name, server, channel). LinkedIn and Facebook stay with Zernio.
alter table public.workspace_credentials
  drop constraint workspace_credentials_provider_check;
alter table public.workspace_credentials
  add constraint workspace_credentials_provider_check
    check (provider in ('anthropic', 'exa', 'github', 'zernio', 'mastodon', 'bluesky', 'discord', 'brevo', 'sendfox'));

-- Same signature as in the SendFox migration, with Bluesky and Discord accepted.
create or replace function public.set_workspace_credential(
  p_workspace_id uuid,
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

  select c.secret_id into v_secret_id
  from public.workspace_credentials c
  where c.workspace_id = p_workspace_id and c.provider = p_provider;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      v_secret, 'pann/' || p_workspace_id || '/' || p_provider, 'Pann workspace credential'
    );
    insert into public.workspace_credentials
      (workspace_id, provider, secret_id, hint, status, status_detail, checked_at, updated_by, meta)
    values (
      p_workspace_id, p_provider, v_secret_id, right(v_secret, 4), p_status, p_status_detail,
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
    where workspace_id = p_workspace_id and provider = p_provider;
  end if;
end;
$$;
