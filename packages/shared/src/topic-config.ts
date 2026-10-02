import { z } from 'zod'
import { DRAFT_MODES, LANGS } from './domain'
import { DRAFT_CHANNELS } from './drafting'

/** Interval bounds, in hours: 1 hour to 90 days. */
export const MIN_INTERVAL_HOURS = 1
export const MAX_INTERVAL_HOURS = 2160
const intervalHours = z.number().int().min(MIN_INTERVAL_HOURS).max(MAX_INTERVAL_HOURS)

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** HH:MM, 24-hour clock. */
const timeSlot = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

/**
 * Everything that is specific to a theme lives here (stored in topics.config, jsonb).
 * Nothing about "accessibility" is hard-coded in the application.
 */
export const topicConfigSchema = z.object({
  categories: z
    .array(z.object({ key: z.string().min(1), label_fr: z.string(), label_en: z.string() }))
    .default([]),
  output_langs: z.array(z.enum(LANGS)).min(1).default(['fr', 'en']),
  ai: z
    .object({
      triage_model: z.string().default('claude-haiku-4-5'),
      draft_model: z.string().default('claude-sonnet-5-5'),
      draft_mode: z.enum(DRAFT_MODES).default('on_validate'),
      /** low: recommended starting point for content generation on Sonnet 5.5. */
      draft_effort: z.enum(['low', 'medium', 'high']).default('low'),
      relevance_threshold: z.number().int().min(0).max(100).default(50),
      /** What makes an item relevant for this topic (triage). */
      relevance_criteria: z.string().max(4000).default(''),
      /**
       * Drafting rules, all optional and written by the user (Settings). Nothing about
       * style, voice or a specific topic is hard-coded in the prompts.
       */
      /** Accuracy rules specific to the topic (versions of standards, legal nuances…). */
      editorial_rules: z.string().max(4000).default(''),
      /** Style and voice of the summaries (length, tone, typography, vocabulary…). */
      style_rules: z.string().max(4000).default(''),
      /** Conventions for social posts (hashtags, emoji, mentions…). */
      post_rules: z.string().max(4000).default(''),
      prompt_version: z.string().default('v1'),
    })
    .prefault({}),
  /** How often sources are collected, by the kind of content they produce. */
  collection: z
    .object({
      intervals_hours: z
        .object({
          news: intervalHours.default(24),
          legal: intervalHours.default(48),
          tool: intervalHours.default(168),
          resource: intervalHours.default(72),
        })
        .prefault({}),
      /** Sources without a kind hint. */
      default_hours: intervalHours.default(24),
      /** Older entries are ignored, so that a new feed does not flood the board with its archive. */
      max_age_days: z.number().int().min(1).max(365).default(30),
    })
    .prefault({}),
  schedule: z
    .object({
      timezone: z.string().refine(isTimeZone).default('Europe/Luxembourg'),
      /** 0 pauses the queue (items can still be published "now"). */
      posts_per_day: z.number().int().min(0).max(10).default(2),
      /** Daily publication times, in `timezone`. One item per slot. */
      slots: z.array(timeSlot).max(10).default(['09:00', '16:00']),
      digest: z
        .object({
          weekday: z.number().int().min(0).max(6).default(5),
          time: timeSlot.default('08:00'),
        })
        .prefault({}),
    })
    .prefault({}),
  /**
   * Where the posts of this topic go: one entry per account, with the languages it
   * publishes (never a bilingual post: one post per language). LinkedIn and Bluesky
   * accounts are Zernio account ids; Mastodon uses the workspace's Mastodon account.
   */
  channels: z.preprocess(
    // Entries written by an older version (account_ref, no languages) are dropped.
    (value) =>
      Array.isArray(value)
        ? value.filter((e) => typeof e === 'object' && e !== null && 'account_id' in e)
        : value,
    z
      .array(
        z.object({
          channel: z.enum(DRAFT_CHANNELS),
          account_id: z.string().min(1).max(200),
          langs: z.array(z.enum(LANGS)).min(1),
        }),
      )
      .refine(
        (entries) => {
          const seen = new Set<string>()
          for (const entry of entries)
            for (const lang of entry.langs) {
              const key = `${entry.channel}/${lang}`
              if (seen.has(key)) return false
              seen.add(key)
            }
          return true
        },
        { message: 'One account per channel and language' },
      )
      .default([]),
  ),
})

export type TopicConfig = z.infer<typeof topicConfigSchema>

export function parseTopicConfig(raw: unknown): TopicConfig {
  return topicConfigSchema.parse(raw ?? {})
}
