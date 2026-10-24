-- Pann: initial schema
-- Multi-tenant from day one: every user-facing row belongs to a workspace.
-- `items` is a shared content cache (one row per canonical URL, whole tool),
-- visible to a workspace only through its topics (item_topics).

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.item_kind as enum ('news', 'legal', 'tool', 'resource');
create type public.item_topic_status as enum ('new', 'validated', 'rejected', 'published', 'archived');
create type public.source_type as enum ('rss', 'exa', 'github');
create type public.channel as enum ('linkedin', 'bluesky', 'mastodon', 'w');
create type public.post_status as enum ('draft', 'scheduled', 'sent', 'failed');
create type public.digest_status as enum ('draft', 'scheduled', 'sent', 'failed');
create type public.publication_status as enum ('pending', 'published', 'unpublished', 'failed');
create type public.workspace_role as enum ('owner', 'editor');
create type public.lang as enum ('fr', 'en');

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         public.workspace_role not null default 'editor',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- Topics (boards) and their sources
-- ---------------------------------------------------------------------------
create table public.topics (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  slug               text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_fr            text not null,
  name_en            text not null,
  config             jsonb not null default '{}'::jsonb,
  monthly_budget_usd numeric(10, 2) not null default 10,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table public.sources (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references public.topics (id) on delete cascade,
  type        public.source_type not null,
  label       text not null,
  config      jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  last_run_at timestamptz,
  last_error  text,
  created_at  timestamptz not null default now()
);
create index sources_topic_idx on public.sources (topic_id);

-- ---------------------------------------------------------------------------
-- Items (shared cache, unique per canonical URL)
-- ---------------------------------------------------------------------------
create table public.items (
  id               uuid primary key default gen_random_uuid(),
  canonical_url    text not null unique,
  title            text not null,
  source_lang      text,
  fetched_content  text,
  published_at     timestamptz,
  discovered_at    timestamptz not null default now(),
  kind             public.item_kind,
  -- tools only: release tag or content hash, used to re-propose updated tools
  change_signature text
);
create index items_title_trgm_idx on public.items using gin (title extensions.gin_trgm_ops);

create table public.item_topics (
  item_id           uuid not null references public.items (id) on delete cascade,
  topic_id          uuid not null references public.topics (id) on delete cascade,
  relevance_score   smallint check (relevance_score between 0 and 100),
  is_commercial     boolean,
  status            public.item_topic_status not null default 'new',
  validated_at      timestamptz,
  last_published_at timestamptz,
  -- change_signature seen when the item was last published (tools)
  published_signature text,
  created_at        timestamptz not null default now(),
  primary key (item_id, topic_id)
);
create index item_topics_board_idx on public.item_topics (topic_id, status, relevance_score desc);

-- ---------------------------------------------------------------------------
-- AI output, scoped to a workspace (editorial rules belong to the workspace)
-- ---------------------------------------------------------------------------
create table public.summaries (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  item_id        uuid not null references public.items (id) on delete cascade,
  lang           public.lang not null,
  summary        text not null,
  key_excerpt    text,
  source_nature  text,
  model          text not null,
  prompt_version text not null,
  edited_by_human boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (workspace_id, item_id, lang)
);

create table public.posts (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items (id) on delete cascade,
  topic_id     uuid not null references public.topics (id) on delete cascade,
  channel      public.channel not null,
  lang         public.lang,          -- null = bilingual single post
  body         text not null,
  status       public.post_status not null default 'draft',
  scheduled_at timestamptz,
  sent_at      timestamptz,
  external_id  text,
  last_error   text,
  created_at   timestamptz not null default now()
);
create index posts_schedule_idx on public.posts (status, scheduled_at);

create table public.digests (
  id           uuid primary key default gen_random_uuid(),
  topic_id     uuid not null references public.topics (id) on delete cascade,
  lang         public.lang not null,
  period_start date not null,
  period_end   date not null,
  status       public.digest_status not null default 'draft',
  external_id  text,
  created_at   timestamptz not null default now(),
  unique (topic_id, lang, period_start)
);

create table public.publications (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items (id) on delete cascade,
  topic_id     uuid not null references public.topics (id) on delete cascade,
  target       text not null,        -- e.g. 'checkfox'
  status       public.publication_status not null default 'pending',
  external_id  text,
  published_at timestamptz,
  last_error   text,
  unique (item_id, topic_id, target)
);

create table public.usage_log (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  topic_id     uuid references public.topics (id) on delete set null,
  provider     text not null,        -- 'anthropic' | 'exa' | …
  model        text,
  operation    text,                 -- 'triage' | 'draft' | 'search' | …
  units        jsonb not null default '{}'::jsonb,  -- tokens in/out, cache reads, searches…
  cost_usd     numeric(12, 6) not null default 0,
  created_at   timestamptz not null default now()
);
create index usage_log_topic_month_idx on public.usage_log (topic_id, created_at);
