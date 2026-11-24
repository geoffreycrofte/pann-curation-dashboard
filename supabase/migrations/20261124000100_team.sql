-- Team (2026-11-24). A workspace holds as many members as its plan allows (the top offer:
-- two, to test the interest in working together). The owner invites a person by address:
-- someone who already has an account joins at once (and gets an e-mail); someone without one
-- gets an account invitation from Supabase, and joins the workspace on their first sign-in,
-- without a personal workspace of their own. Invited people are editors.

-- Seats of each plan. Null: no limit (custom, set per workspace in plan_limits).
alter table public.plans add column max_members integer check (max_members > 0);
update public.plans set max_members = case key
  when 'pro' then 2
  when 'custom' then null
  else 1
end;
grant update (max_members) on public.plans to authenticated;

create or replace function private.workspace_max_members(p_workspace_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select case when w.plan = 'custom' then (w.plan_limits ->> 'max_members')::integer
    else p.max_members end
  from public.workspaces w
  join public.plans p on p.key = w.plan
  where w.id = p_workspace_id;
$$;

-- Pending invitations: a person without an account yet, invited by an owner.
create table public.workspace_invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email        text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  invited_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Set by the job: the person joined (existing account) or got Supabase's invitation.
  processed_at timestamptz,
  -- Error code when the job could not invite (packages/shared/src/providers.ts).
  error        text,
  unique (workspace_id, email)
);
create index workspace_invitations_email_idx on public.workspace_invitations (email);
create index workspace_invitations_invited_by_idx on public.workspace_invitations (invited_by);

alter table public.workspace_invitations enable row level security;
create policy "members read invitations" on public.workspace_invitations
  for select to authenticated using ((select private.is_member(workspace_id)));
create policy "owners invite" on public.workspace_invitations
  for insert to authenticated
  with check ((select private.is_owner(workspace_id)) and invited_by = (select auth.uid()));
create policy "owners cancel invitations" on public.workspace_invitations
  for delete to authenticated using ((select private.is_owner(workspace_id)));
revoke update on public.workspace_invitations from authenticated, anon;

-- Seats: members plus pending invitations stay within the plan.
create or replace function private.check_member_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_max integer := private.workspace_max_members(new.workspace_id);
  v_used bigint;
begin
  -- Only owners invite (the policy checks it too, but after this trigger: say it first).
  if tg_table_name = 'workspace_invitations' and not private.is_owner(new.workspace_id) then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if v_max is null then return new; end if;
  -- One at a time per workspace: two invitations sent together cannot both take the last seat.
  perform pg_advisory_xact_lock(hashtext('seats:' || new.workspace_id::text));
  select (select count(*) from public.workspace_members m where m.workspace_id = new.workspace_id)
    + (select count(*) from public.workspace_invitations i where i.workspace_id = new.workspace_id)
    into v_used;
  if v_used >= v_max then
    raise exception 'member_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- The invitation of a person who joins is deleted in the same transaction as their
-- membership is added (below): it frees its seat for the membership.
create trigger workspace_members_limit
  before insert on public.workspace_members
  for each row execute function private.check_member_limit();
create trigger workspace_invitations_limit
  before insert on public.workspace_invitations
  for each row execute function private.check_member_limit();

-- An invitation to someone already a member is refused (before the seats: triggers run in
-- the order of their names).
create or replace function private.check_invitation_target()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.workspace_members m
    join auth.users u on u.id = m.user_id
    where m.workspace_id = new.workspace_id and lower(u.email) = new.email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;
  return new;
end;
$$;
create trigger workspace_invitations_check_target
  before insert on public.workspace_invitations
  for each row execute function private.check_invitation_target();

-- Job (secret key): an existing account joins at once; otherwise the API asks Supabase to
-- invite the address. Returns 'joined' (with the user's id), 'invite' or 'gone'.
create or replace function public.process_invitation_for_jobs(p_invitation_id uuid)
returns table (outcome text, user_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.workspace_invitations;
  v_user uuid;
begin
  select * into v_inv from public.workspace_invitations where id = p_invitation_id for update;
  if not found then
    return query select 'gone'::text, null::uuid;
    return;
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = v_inv.email limit 1;
  if v_user is null then
    return query select 'invite'::text, null::uuid;
    return;
  end if;
  delete from public.workspace_invitations where id = p_invitation_id;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_inv.workspace_id, v_user, 'editor')
  on conflict do nothing;
  return query select 'joined'::text, v_user;
end;
$$;
revoke execute on function public.process_invitation_for_jobs from public, anon, authenticated;
grant execute on function public.process_invitation_for_jobs to service_role;

-- A new account: an invited person joins the workspaces that invited them, and gets no
-- personal workspace of their own; anyone else gets one, as before.
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ws uuid;
  v_inv public.workspace_invitations;
  v_joined boolean := false;
begin
  for v_inv in
    select * from public.workspace_invitations where email = lower(new.email) for update
  loop
    delete from public.workspace_invitations where id = v_inv.id;
    -- A workspace full since (its plan changed): the account is still created.
    begin
      insert into public.workspace_members (workspace_id, user_id, role)
      values (v_inv.workspace_id, new.id, 'editor');
      v_joined := true;
    exception when raise_exception then
      null;
    end;
  end loop;
  if v_joined then return new; end if;

  insert into public.workspaces (name)
  values (coalesce(split_part(new.email, '@', 1), 'Workspace'))
  returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, new.id, 'owner');

  return new;
end;
$$;

-- Owners remove a member; a member leaves. The owner stays (transfer first).
create or replace function public.remove_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not (private.is_owner(p_workspace_id) or (p_user_id = v_me and private.is_member(p_workspace_id))) then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_user_id and role = 'owner'
  ) then
    raise exception 'owner_stays' using errcode = '22023';
  end if;
  delete from public.workspace_members
  where workspace_id = p_workspace_id and user_id = p_user_id;
  if not found then
    raise exception 'not_a_member' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function public.remove_workspace_member from public, anon;
grant execute on function public.remove_workspace_member to authenticated;

-- For the board: the seats of the plan.
drop function public.workspace_plan(uuid);
create function public.workspace_plan(p_workspace_id uuid)
returns table (
  plan text,
  max_topics integer,
  max_social_accounts integer,
  monthly_tokens bigint,
  max_members integer,
  topics bigint,
  members bigint,
  month_tokens bigint,
  billing_status text,
  trial_ends_at timestamptz,
  plan_chosen_at timestamptz,
  billing_interval text,
  current_period_end timestamptz,
  active boolean,
  subscribed boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_member(p_workspace_id) then
    raise exception 'Not a member' using errcode = '42501';
  end if;
  return query
    select l.plan, l.max_topics, l.max_social_accounts, l.monthly_tokens,
      private.workspace_max_members(p_workspace_id),
      (select count(*) from public.topics t where t.workspace_id = p_workspace_id),
      (select count(*) from public.workspace_members m where m.workspace_id = p_workspace_id),
      private.workspace_month_tokens(p_workspace_id),
      w.billing_status, w.trial_ends_at, w.plan_chosen_at, w.billing_interval,
      w.current_period_end,
      private.workspace_active(p_workspace_id),
      w.stripe_subscription_id is not null
    from private.workspace_limits(p_workspace_id) l
    cross join public.workspaces w
    where w.id = p_workspace_id;
end;
$$;
revoke execute on function public.workspace_plan from public, anon;
grant execute on function public.workspace_plan to authenticated;
