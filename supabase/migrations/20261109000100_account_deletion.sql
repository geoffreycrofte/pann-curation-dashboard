-- Pann: deleting an account (Profile page).
--
-- The workspaces where the person is the only member go with the account: their
-- topics, sources, item links, summaries, posts, newsletters, usage and service keys
-- (cascade from public.workspaces), and the Vault secrets of those keys, which no
-- foreign key reaches. Shared items stay: they are a cache common to every workspace.
-- An owner of a workspace that other people use cannot be deleted yet (there is no
-- transfer of ownership): the API refuses before queuing the job.
--
-- Jobs only (secret key): the job then deletes the auth user, which removes the
-- remaining memberships and the person's own rewrite requests.

create function public.delete_account_data(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_alone uuid[];
begin
  if exists (
    select 1
    from public.workspace_members m
    where m.user_id = p_user_id
      and m.role = 'owner'
      and exists (
        select 1 from public.workspace_members o
        where o.workspace_id = m.workspace_id and o.user_id <> p_user_id
      )
  ) then
    raise exception 'workspace_has_members' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(m.workspace_id), '{}') into v_alone
  from public.workspace_members m
  where m.user_id = p_user_id
    and not exists (
      select 1 from public.workspace_members o
      where o.workspace_id = m.workspace_id and o.user_id <> p_user_id
    );

  delete from vault.secrets s
  using public.workspace_credentials c
  where c.secret_id = s.id and c.workspace_id = any (v_alone);

  delete from public.workspaces w where w.id = any (v_alone);

  return jsonb_build_object('workspaces_deleted', cardinality(v_alone));
end;
$$;

revoke execute on function public.delete_account_data from public, anon, authenticated;
grant execute on function public.delete_account_data to service_role;
