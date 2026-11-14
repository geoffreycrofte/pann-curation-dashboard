-- First comment of a LinkedIn post, published right after it through Zernio.
-- null: the default of the topic (topics.config.linkedin.first_comment); '': no comment;
-- any other text: this comment instead of the default. Limit matches FIRST_COMMENT_MAX
-- (packages/shared/src/drafting.ts).

alter table public.posts
  add column first_comment text
    check (first_comment is null or char_length(first_comment) <= 1250);

-- Members edit it like the text of the post (row access stays with the RLS policy).
grant update (first_comment) on public.posts to authenticated;
