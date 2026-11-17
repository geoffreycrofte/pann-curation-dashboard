-- Access requests (2026-11-17): sign-up stays on invitation; a person without an account
-- sends a motivated request from the login page. It is stored here, listed in the admin
-- space, and a job emails the platform admins through Resend (Pann's own key).

-- Resend joins Pann's own keys (transactional email of the service).
alter table public.platform_credentials
  drop constraint platform_credentials_provider_check,
  add constraint platform_credentials_provider_check
    check (provider in ('anthropic', 'zernio', 'resend'));

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
  if p_provider not in ('anthropic', 'zernio', 'resend') then
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

-- Sender of the service emails, on a domain verified in Resend ("Pann <noreply@…>").
alter table public.platform_settings
  add column email_from text not null default ''
    check (email_from = '' or email_from ~ '^[^<>]*<?[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>?$');
grant update (email_from) on public.platform_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------
create table public.access_requests (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 120),
  email        text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  motivation   text not null check (char_length(motivation) between 20 and 2000),
  -- Interface language of the person (fr, en), to answer them in it.
  lang         text not null default 'fr' check (lang in ('fr', 'en')),
  -- SHA-256 of the client address: limits the requests per address, without keeping it.
  ip_hash      text,
  status       text not null default 'new' check (status in ('new', 'accepted', 'declined')),
  notified_at  timestamptz,
  notify_error text,
  handled_at   timestamptz,
  handled_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index access_requests_created_idx on public.access_requests (created_at desc);
create index access_requests_ip_idx on public.access_requests (ip_hash, created_at);
create index access_requests_handled_by_idx on public.access_requests (handled_by);

alter table public.access_requests enable row level security;
create policy "platform admins read access requests" on public.access_requests
  for select to authenticated using ((select private.is_platform_admin()));
create policy "platform admins handle access requests" on public.access_requests
  for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));
revoke insert, update, delete on public.access_requests from authenticated, anon;
grant update (status, handled_at, handled_by) on public.access_requests to authenticated;

-- Anyone can ask, without an account. Limits: 3 requests a day per client address, and
-- one open request per email address (a second one is accepted silently, not stored:
-- the answer never tells whether an address already asked). Returns the id to notify,
-- or null when nothing was stored.
create or replace function public.request_access(
  p_name text,
  p_email text,
  p_motivation text,
  p_lang text,
  p_ip_hash text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if p_ip_hash is not null and (
    select count(*) from public.access_requests
    where ip_hash = p_ip_hash and created_at > now() - interval '1 day'
  ) >= 3 then
    return null;
  end if;
  if exists (
    select 1 from public.access_requests where email = v_email and status = 'new'
  ) then
    return null;
  end if;
  insert into public.access_requests (name, email, motivation, lang, ip_hash)
  values (
    trim(p_name), v_email, trim(p_motivation),
    case when p_lang in ('fr', 'en') then p_lang else 'fr' end, p_ip_hash
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.request_access from public;
grant execute on function public.request_access to anon, authenticated;

-- Jobs: who to notify (the platform admins' addresses), with the secret key only.
create or replace function public.platform_admin_emails()
returns table (email text)
language sql stable security definer set search_path = ''
as $$
  select u.email::text from private.platform_admins a
  join auth.users u on u.id = a.user_id
  where u.email is not null;
$$;
revoke execute on function public.platform_admin_emails from public, anon, authenticated;
grant execute on function public.platform_admin_emails to service_role;
