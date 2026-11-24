-- Transfer of a workspace's ownership (2026-11-23). An owner hands the workspace to another
-- member, who becomes the owner; the former owner stays, as an editor. It lets an owner
-- whose workspace other people use delete their account (or be deleted for inactivity).

-- Members: the people of a workspace, with their address (auth.users is not readable).
create or replace function public.workspace_members_list(p_workspace_id uuid)
returns table (user_id uuid, email text, role text, is_me boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_member(p_workspace_id) then
    raise exception 'Workspace not found' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role::text, m.user_id = (select auth.uid())
    from public.workspace_members m
    join auth.users u on u.id = m.user_id
    where m.workspace_id = p_workspace_id
    order by m.role = 'owner' desc, m.created_at;
end;
$$;
revoke execute on function public.workspace_members_list from public, anon;
grant execute on function public.workspace_members_list to authenticated;

-- Owners: hand the workspace to another member of it.
create or replace function public.transfer_workspace_ownership(
  p_workspace_id uuid,
  p_new_owner uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not private.is_owner(p_workspace_id) then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_new_owner = v_me or not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_new_owner
  ) then
    raise exception 'not_a_member' using errcode = '22023';
  end if;
  update public.workspace_members set role = 'owner'
  where workspace_id = p_workspace_id and user_id = p_new_owner;
  update public.workspace_members set role = 'editor'
  where workspace_id = p_workspace_id and user_id = v_me;
end;
$$;
revoke execute on function public.transfer_workspace_ownership from public, anon;
grant execute on function public.transfer_workspace_ownership to authenticated;
