import type { Lang } from './domain'

/**
 * Channels Pann can write a post for. Bluesky, Mastodon and Discord are published
 * directly; LinkedIn and Facebook through Zernio. X is left out on purpose.
 */
export const DRAFT_CHANNELS = ['linkedin', 'bluesky', 'mastodon', 'facebook', 'discord'] as const
export type DraftChannel = (typeof DRAFT_CHANNELS)[number]

/** Always drafted. Facebook and Discord only when a topic publishes there. */
export const DEFAULT_DRAFT_CHANNELS: readonly DraftChannel[] = ['linkedin', 'bluesky', 'mastodon']

/**
 * Length limits of a post, in characters (graphemes for Bluesky). Mastodon: the default
 * of mastodon.social; other instances can differ. Checked 2026-10-01. Discord: 2,000 per
 * message. Facebook allows 63,206 but cuts the post at about 480 behind "See more": Pann
 * keeps the LinkedIn length.
 */
export const POST_LIMITS: Record<DraftChannel, number> = {
  linkedin: 3000,
  bluesky: 300,
  mastodon: 500,
  facebook: 3000,
  discord: 2000,
}

/**
 * Source text pasted by a person when Pann could not read the page (paywall, script-only
 * page). Below the minimum, drafting fetches the page again and could keep a longer teaser
 * instead; the maximum leaves room above what drafting reads.
 */
export const SOURCE_TEXT_MIN = 600
export const SOURCE_TEXT_MAX = 60_000

/**
 * LinkedIn extras (topic settings and posts). The signature takes room from the post
 * itself; the first comment is capped by Pann, well under what a post allows.
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
