import type { Lang } from './langs'

/**
 * Channels Glimr can write a post for. Bluesky, W, Mastodon, Discord and Telegram are
 * published directly; LinkedIn and Facebook through Zernio. X is left out on purpose.
 */
export const DRAFT_CHANNELS = [
  'linkedin',
  'bluesky',
  'w',
  'mastodon',
  'facebook',
  'discord',
  'telegram',
] as const
export type DraftChannel = (typeof DRAFT_CHANNELS)[number]

/** Always drafted. W, Facebook, Discord and Telegram only when a topic publishes there. */
export const DEFAULT_DRAFT_CHANNELS: readonly DraftChannel[] = ['linkedin', 'bluesky', 'mastodon']

/**
 * Length limits of a post, in characters (graphemes for Bluesky). Mastodon: the default
 * of mastodon.social; other instances can differ. Checked 2026-10-01. Discord: 2,000 per
 * message. Telegram: 4,096 per message. Facebook allows 63,206 but cuts the post at about 480 behind "See more": Glimr
 * keeps the LinkedIn length.
 */
export const POST_LIMITS: Record<DraftChannel, number> = {
  linkedin: 3000,
  bluesky: 300,
  // W runs on the AT Protocol: Bluesky's records, Bluesky's limit (checked 2026-11-25).
  w: 300,
  mastodon: 500,
  facebook: 3000,
  discord: 2000,
  telegram: 4096,
}

/**
 * Source text pasted by a person when Glimr could not read the page (paywall, script-only
 * page). Below the minimum, drafting fetches the page again and could keep a longer teaser
 * instead; the maximum leaves room above what drafting reads.
 */
export const SOURCE_TEXT_MIN = 600
export const SOURCE_TEXT_MAX = 60_000

/**
 * LinkedIn extras (topic settings and posts). The signature takes room from the post
 * itself; the first comment is capped by Glimr, well under what a post allows.
 */
export const LINKEDIN_SIGNATURE_MAX = 600
export const FIRST_COMMENT_MAX = 1250

export const DRAFT_STATUSES = ['none', 'pending', 'ready', 'failed'] as const
export type DraftStatus = (typeof DRAFT_STATUSES)[number]

export const SOURCE_NATURES_LIST = [
  'institutional',
  'regulatory',
  'primary',
  'expert',
  'press',
  'commercial',
] as const

export interface Summary {
  lang: Lang
  summary: string
  key_excerpt: string | null
  source_nature: string | null
  edited_by_human: boolean
  model: string
  updated_at: string
}

export interface PostDraft {
  id: string
  channel: DraftChannel
  lang: Lang | null
  body: string
  /** LinkedIn: null = default of the topic, '' = none, else this comment. */
  first_comment: string | null
  status: 'draft' | 'scheduled' | 'sent' | 'failed'
  edited_by_human: boolean
  scheduled_at: string | null
  sent_at: string | null
  published_url: string | null
  last_error: string | null
  /** Set while a job publishes the post: it can no longer be edited or unscheduled. */
  claimed_at: string | null
}

/** Visible length of a post: counts grapheme clusters (emoji, accents) like Bluesky. */
export function postLength(text: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    let count = 0
    for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text))
      count++
    return count
  }
  return [...text].length
}

/**
 * Length and hashtags of a post, per network: settings of the topic (ai.network_rules),
 * editable in Settings, Drafting. Every network has defaults, so that no post goes out
 * without a frame: adding a network to Glimr means adding its defaults here.
 */
export interface NetworkPostRule {
  /** Characters of the text, link excluded; null: no minimum. */
  min_chars: number | null
  max_chars: number
  max_hashtags: number
}

export const NETWORK_POST_DEFAULTS: Record<DraftChannel, NetworkPostRule> = {
  linkedin: { min_chars: 800, max_chars: 1300, max_hashtags: 3 },
  facebook: { min_chars: 300, max_chars: 800, max_hashtags: 3 },
  bluesky: { min_chars: null, max_chars: 280, max_hashtags: 2 },
  w: { min_chars: null, max_chars: 280, max_hashtags: 2 },
  mastodon: { min_chars: null, max_chars: 450, max_hashtags: 2 },
  discord: { min_chars: 200, max_chars: 800, max_hashtags: 0 },
  telegram: { min_chars: 300, max_chars: 1000, max_hashtags: 2 },
}

/** Most hashtags a setting may allow (a guard against loops counts above it). */
export const MAX_HASHTAGS_SETTING = 10
