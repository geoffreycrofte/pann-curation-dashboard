-- Telegram published directly (2026-11-25), like Discord: no app review, no fee. The key is
-- a bot token (from BotFather); the bot is an administrator of a channel and posts there.
-- The account is the channel's id (meta: chat id, title, public name, bot).
alter type public.channel add value if not exists 'telegram';

alter table public.workspace_credentials
  drop constraint workspace_credentials_provider_check;
alter table public.workspace_credentials
  add constraint workspace_credentials_provider_check
    check (provider in ('anthropic', 'exa', 'github', 'zernio', 'mastodon', 'bluesky', 'discord',
      'telegram', 'brevo', 'sendfox'));

-- Same as in the multi-accounts migration, with Telegram accepted (several channels).
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
  if p_provider not in ('anthropic', 'exa', 'github', 'zernio', 'mastodon', 'bluesky', 'discord',
    'telegram', 'brevo', 'sendfox') then
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
  if v_account <> '' and p_provider not in ('mastodon', 'bluesky', 'discord', 'telegram') then
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
