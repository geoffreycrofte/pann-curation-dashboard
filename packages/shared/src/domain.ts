/**
 * Technical vocabulary shared by the API, the jobs and the board.
 * The gold-panning metaphor (nugget, pan…) lives only in UI translations.
 */

export const LANGS = ['fr', 'en'] as const
export type Lang = (typeof LANGS)[number]

export const ITEM_KINDS = ['news', 'legal', 'tool', 'resource'] as const
export type ItemKind = (typeof ITEM_KINDS)[number]

export const ITEM_TOPIC_STATUSES = [
  'new',
  'validated',
  'rejected',
  'published',
  'archived',
] as const
export type ItemTopicStatus = (typeof ITEM_TOPIC_STATUSES)[number]

/**
 * Statuses that collection jobs must never reset to `new` (anti-reproposition).
 * The user can still move a rejected item manually; tools re-open on change_signature.
 */
export const LOCKED_STATUSES: readonly ItemTopicStatus[] = ['published', 'rejected']

export const ITEM_ORIGINS = ['collected', 'manual'] as const
export type ItemOrigin = (typeof ITEM_ORIGINS)[number]

export const SOURCE_TYPES = ['rss', 'exa', 'github'] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

export const CHANNELS = ['linkedin', 'bluesky', 'mastodon', 'w'] as const
export type Channel = (typeof CHANNELS)[number]

export const POST_STATUSES = ['draft', 'scheduled', 'sent', 'failed'] as const
export type PostStatus = (typeof POST_STATUSES)[number]

export const SOURCE_NATURES = [
  'institutional',
  'regulatory',
  'primary',
  'expert',
  'press',
  'commercial',
] as const
export type SourceNature = (typeof SOURCE_NATURES)[number]

export const DRAFT_MODES = ['on_validate', 'on_display'] as const
export type DraftMode = (typeof DRAFT_MODES)[number]

export interface Topic {
  id: string
  workspace_id: string
  slug: string
  name_fr: string
  name_en: string
  active: boolean
  monthly_budget_usd: number
}

export interface BoardItem {
  item_id: string
  topic_id: string
  canonical_url: string
  title: string
  source_lang: string | null
  kind: ItemKind | null
  origin: ItemOrigin
  published_at: string | null
  discovered_at: string
  relevance_score: number | null
  status: ItemTopicStatus
  validated_at: string | null
}

export interface Source {
  id: string
  topic_id: string
  type: SourceType
  label: string
  config: Record<string, unknown>
  active: boolean
  default_kind: ItemKind | null
  interval_hours: number | null
  last_run_at: string | null
  last_error: string | null
  run_requested_at: string | null
  created_at: string
}
