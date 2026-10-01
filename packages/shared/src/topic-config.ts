import { z } from 'zod'
import { CHANNELS, DRAFT_MODES, LANGS } from './domain'

/** Interval bounds, in hours: 1 hour to 90 days. */
export const MIN_INTERVAL_HOURS = 1
export const MAX_INTERVAL_HOURS = 2160
const intervalHours = z.number().int().min(MIN_INTERVAL_HOURS).max(MAX_INTERVAL_HOURS)

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
      relevance_criteria: z.string().default(''),
      editorial_rules: z.string().default(''),
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
      timezone: z.string().default('Europe/Luxembourg'),
      posts_per_day: z.number().int().min(0).max(10).default(2),
      slots: z.array(timeSlot).default(['09:00', '16:00']),
      digest: z
        .object({
          weekday: z.number().int().min(0).max(6).default(5),
          time: timeSlot.default('08:00'),
        })
        .prefault({}),
    })
    .prefault({}),
  channels: z
    .array(
      z.object({
        channel: z.enum(CHANNELS),
        account_ref: z.string(),
        bilingual_single_post: z.boolean().default(false),
      }),
    )
    .default([]),
})

export type TopicConfig = z.infer<typeof topicConfigSchema>

export function parseTopicConfig(raw: unknown): TopicConfig {
  return topicConfigSchema.parse(raw ?? {})
}
