-- Pann: the newsletter is built from the items scheduled or published on the social
-- networks, no longer from the items validated. Each issue records the items it holds,
-- so an item goes out in one issue only, whenever it was scheduled.
create table public.digest_items (
  digest_id uuid not null references public.digests (id) on delete cascade,
  item_id   uuid not null references public.items (id) on delete cascade,
  primary key (digest_id, item_id)
);

create index digest_items_item_idx on public.digest_items (item_id);

-- Written by jobs only (secret key); members read the items of the issues they can see.
alter table public.digest_items enable row level security;

create policy "members read digest items" on public.digest_items
  for select to authenticated using (
    exists (
      select 1 from public.digests d
      where d.id = digest_id and private.can_access_topic(d.topic_id)
    )
  );

revoke insert, update, delete on public.digest_items from authenticated, anon;
