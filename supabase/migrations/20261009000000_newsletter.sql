-- Pann: weekly newsletter (step 7). One Brevo campaign per language, sent to the list
-- of that language, with the items validated since the previous issue.

-- ---------------------------------------------------------------------------
-- New service: Brevo. `meta` holds its contact lists and senders (not secret).
-- ---------------------------------------------------------------------------
alter table public.workspace_credentials
  drop constraint workspace_credentials_provider_check;
alter table public.workspace_credentials
  add constraint workspace_credentials_provider_check
    check (provider in ('anthropic', 'exa', 'github', 'zernio', 'mastodon', 'brevo'));

-- Same signature as in the diffusion migration, with Brevo accepted.
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
  if p_provider not in ('anthropic', 'exa', 'github', 'zernio', 'mastodon', 'brevo') then
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

-- ---------------------------------------------------------------------------
-- Issues of the newsletter. Written by jobs only; members read them (existing policy).
-- period_from / period_to: items validated in this window are in the issue. The next
-- issue starts where the last sent one ended, so nothing is left out or sent twice.
-- ---------------------------------------------------------------------------
alter type public.digest_status add value if not exists 'skipped';

alter table public.digests
  drop constraint if exists digests_topic_id_lang_period_start_key;
alter table public.digests
  add column period_from timestamptz,
  add column period_to timestamptz,
  add column item_count integer not null default 0,
  add column subject text,
  add column sent_at timestamptz,
  add column last_error text,
  add column updated_at timestamptz not null default now();

-- One issue per topic, language and scheduled time (a second run does nothing).
create unique index digests_issue_idx on public.digests (topic_id, lang, period_to);
create index digests_topic_sent_idx on public.digests (topic_id, lang, sent_at desc);
