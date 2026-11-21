-- Pann's Exa key (2026-11-21): the plans migration let the table hold it, but the function
-- that saves Pann's keys still refused the provider ("Unknown provider", a 500 in the admin).

create or replace function public.set_platform_credential(
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
  if not private.is_platform_admin() then
    raise exception 'Platform admins only' using errcode = '42501';
  end if;
  if p_provider not in ('anthropic', 'zernio', 'resend', 'exa') then
    raise exception 'Unknown provider' using errcode = '22023';
  end if;
  if length(v_secret) < 8 or length(v_secret) > 500 then
    raise exception 'Invalid key' using errcode = '22023';
  end if;
  if p_status not in ('unchecked', 'ok', 'invalid') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  select c.secret_id into v_secret_id from public.platform_credentials c
  where c.provider = p_provider;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(v_secret, 'pann/platform/' || p_provider, 'Pann platform key');
    insert into public.platform_credentials
      (provider, secret_id, hint, status, status_detail, checked_at, meta, updated_by)
    values (
      p_provider, v_secret_id, right(v_secret, 4), p_status, p_status_detail,
      case when p_status <> 'unchecked' then now() end, coalesce(p_meta, '{}'::jsonb), auth.uid()
    );
  else
    perform vault.update_secret(v_secret_id, v_secret);
    update public.platform_credentials set
      hint = right(v_secret, 4),
      status = p_status,
      status_detail = p_status_detail,
      checked_at = case when p_status <> 'unchecked' then now() end,
      meta = coalesce(p_meta, '{}'::jsonb),
      updated_at = now(),
      updated_by = auth.uid()
    where provider = p_provider;
  end if;
end;
$$;
