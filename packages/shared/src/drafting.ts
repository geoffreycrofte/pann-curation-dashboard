import type { Lang } from './domain'

/** Channels that get a post draft for each validated item. */
export const DRAFT_CHANNELS = ['linkedin', 'bluesky', 'mastodon'] as const
export type DraftChannel = (typeof DRAFT_CHANNELS)[number]

/**
 * Length limits of a post, in characters (graphemes for Bluesky). Mastodon: the default
 * of mastodon.social; other instances can differ. Checked 2026-10-01.
 */
export const POST_LIMITS: Record<DraftChannel, number> = {
  linkedin: 3000,
  bluesky: 300,
  mastodon: 500,
}

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
