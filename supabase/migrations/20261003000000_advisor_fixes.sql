-- Pann: fixes from the Supabase security and performance advisors.

-- ---------------------------------------------------------------------------
-- Indexes covering foreign keys (deletes and joins)
-- ---------------------------------------------------------------------------
create index items_added_by_idx on public.items (added_by);
create index posts_item_idx on public.posts (item_id);
create index posts_topic_idx on public.posts (topic_id);
create index publications_topic_idx on public.publications (topic_id);
create index sources_created_by_idx on public.sources (created_by);
create index summaries_item_idx on public.summaries (item_id);
create index usage_log_workspace_idx on public.usage_log (workspace_id, created_at);

-- ---------------------------------------------------------------------------
-- workspace_members: one SELECT policy only (the "for all" owner policy
-- overlapped the members' read policy).
-- ---------------------------------------------------------------------------
drop policy "owners manage memberships" on public.workspace_members;

create policy "owners add memberships" on public.workspace_members
  for insert to authenticated with check (private.is_owner(workspace_id));
create policy "owners update memberships" on public.workspace_members
  for update to authenticated using (private.is_owner(workspace_id)) with check (private.is_owner(workspace_id));
create policy "owners remove memberships" on public.workspace_members
  for delete to authenticated using (private.is_owner(workspace_id));

-- ---------------------------------------------------------------------------
-- Hosted projects created with "automatic RLS" have an event trigger function
-- public.rls_auto_enable(). It cannot be called through the API (event trigger),
-- but it is exposed in the public schema: remove EXECUTE to be explicit.
-- Absent from the local stack, hence the guard.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
