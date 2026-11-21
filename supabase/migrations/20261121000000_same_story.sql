-- Same story told twice (2026-11-21): the triage names the recent item of the topic that
-- reports the same news, from another site or in other words. The board shows the link;
-- the person decides. Set by the triage job only (no update grant to users).
--
-- No foreign key on purpose: a second key from item_topics to items would make every
-- `item:items (...)` embed of the API ambiguous. A deleted item only hides the link.
alter table public.item_topics add column same_story_of uuid;

comment on column public.item_topics.same_story_of is
  'Recent item of the same topic that reports the same story, found at triage.';
