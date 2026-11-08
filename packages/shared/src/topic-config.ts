import { z } from 'zod'
import { DRAFT_MODES, LANGS, type Lang } from './domain'
import { DRAFT_CHANNELS } from './drafting'
import { domainSchema } from './source-config'

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

export const KIND_KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** A kind of content of a topic: shown on the board, chosen by the AI triage. */
export const kindSchema = z.object({
  key: z.string().regex(KIND_KEY).max(40),
  label_fr: z.string().trim().min(1).max(60),
  label_en: z.string().trim().min(1).max(60),
  /** What belongs to this kind; given to the AI triage to choose it. */
  description: z.string().trim().max(300).default(''),
})
export type TopicKind = z.infer<typeof kindSchema>

/** Kinds offered by Pann to every new topic; each topic can rename, add or remove kinds. */
export const DEFAULT_KINDS: TopicKind[] = [
  {
    key: 'news',
    label_fr: 'Actualité',
    label_en: 'News',
    description: 'Announcements, events, industry news.',
  },
  {
    key: 'legal',
    label_fr: 'Légal',
    label_en: 'Legal',
    description: 'Laws, regulations, standards, court or authority decisions, official guidance.',
  },
  {
    key: 'tool',
    label_fr: 'Outil',
    label_en: 'Tool',
    description: 'Software, libraries, extensions, services, new releases.',
  },
  {
    key: 'resource',
    label_fr: 'Ressource',
    label_en: 'Resource',
    description: 'Guides, tutorials, articles, research, talks.',
  },
]

/**
 * Tools of a topic, enabled separately. A topic is a product (or a theme) to market:
 * - curation: collect, sort and share other people's content (board, posts, newsletter);
 * - engagement: find conversations where the product's team can help, draft replies.
 */
export const TOPIC_MODULES = ['curation', 'engagement'] as const
export type TopicModule = (typeof TOPIC_MODULES)[number]

const optionalUrl = z.union([z.url({ protocol: /^https?$/ }), z.literal('')]).default('')
const productText = (max: number) => z.string().trim().max(max).default('')

/**
 * What the topic markets, written by the user. Shared by the tools of the topic; given
 * to the AI when it writes on behalf of the product (engagement replies).
 */
export const productSchema = z
  .object({
    name: productText(100),
    url: optionalUrl,
    /** What the product is and does, for whom. */
    description: productText(2000),
    /** Who the product is for, their problems. */
    audience: productText(2000),
    /** Positioning and key messages. */
    messages: productText(4000),
    /** Verifiable facts that support the messages, with their source. */
    proof_points: productText(4000),
    /** Promises and wordings never to use. */
    claims_to_avoid: productText(4000),
    /** Sentence that discloses the author's link to the product when it is mentioned. */
    disclosure: productText(300),
  })
  .prefault({})
export type TopicProduct = z.infer<typeof productSchema>

/**
 * Everything that is specific to a theme lives here (stored in topics.config, jsonb).
 * Nothing about "accessibility" is hard-coded in the application.
 */
export const topicConfigSchema = z.object({
  /** Existing topics were curation boards: curation on, engagement off by default. */
  modules: z
    .object({
      curation: z.boolean().default(true),
      engagement: z.boolean().default(false),
    })
    .prefault({}),
  product: productSchema,
  /** Engagement tool: how conversations are judged and how far back they are read. */
  engagement: z
    .object({
      /** What makes a conversation worth joining for this product (user setting). */
      criteria: z.string().trim().max(4000).default(''),
      /** Conversations scored below this opportunity are archived. */
      threshold: z.number().int().min(0).max(100).default(60),
      /** Older conversations are not collected: a late reply rarely helps. */
      max_age_days: z.number().int().min(1).max(90).default(14),
    })
    .prefault({}),
  kinds: z
    .array(kindSchema)
    .min(1)
    .max(20)
    .refine((kinds) => new Set(kinds.map((k) => k.key)).size === kinds.length, {
      message: 'Kind keys must be unique',
    })
    .default(DEFAULT_KINDS),
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
      /** By kind key; a kind without its own interval uses default_hours. */
      intervals_hours: z
        .record(z.string(), intervalHours)
        .default({ news: 24, legal: 48, tool: 168, resource: 72 }),
      /** Sources without a kind hint. */
      default_hours: intervalHours.default(24),
      /** Older entries are ignored, so that a new feed does not flood the board with its archive. */
      max_age_days: z.number().int().min(1).max(365).default(30),
      /**
       * Sites never proposed for this topic (competitors, unsuitable sites…): dropped
       * at collection, passed to Exa as excluded domains. Subdomains included.
       */
      excluded_domains: z.array(domainSchema).max(500).default([]),
    })
    .prefault({}),
  schedule: z
    .object({
      timezone: z.string().refine(isTimeZone).default('Europe/Luxembourg'),
      /** 0 pauses the queue (items can still be published "now"). */
      posts_per_day: z.number().int().min(0).max(10).default(2),
      /** Daily publication times, in `timezone`. One item per slot. */
      slots: z.array(timeSlot).max(10).default(['09:00', '16:00']),
      /** Weekly newsletter: day (0 Sunday to 6 Saturday) and time, in `timezone`. */
      digest: z
        .object({
          weekday: z.number().int().min(0).max(6).default(5),
          time: timeSlot.default('08:00'),
        })
        .prefault({}),
    })
    .prefault({}),
  /**
   * Weekly newsletter (Brevo): one campaign per output language, sent to the list of
   * that language. Content: the items validated since the previous newsletter.
   */
  newsletter: z
    .object({
      /** Off: the newsletter is only sent from the board ("Send now"). */
      auto_send: z.boolean().default(false),
      /** Brevo sender id (Brevo checks the sender address). */
      sender_id: z.number().int().positive().nullable().default(null),
      lists: z
        .object({
          fr: z.number().int().positive().nullable().default(null),
          en: z.number().int().positive().nullable().default(null),
        })
        .prefault({}),
      /** Name of the newsletter, shown at the top and in the subject. */
      title_fr: z.string().trim().max(120).default(''),
      title_en: z.string().trim().max(120).default(''),
      /** Short text at the top of each issue, written by the user. */
      intro_fr: z.string().trim().max(2000).default(''),
      intro_en: z.string().trim().max(2000).default(''),
    })
    .prefault({}),
  /**
   * Public feeds (RSS and JSON Feed), turned on per topic from the board. The feed
   * address itself (topics.feed_key) is not part of the config.
   */
  feed: z
    .object({
      title_fr: z.string().trim().max(120).default(''),
      title_en: z.string().trim().max(120).default(''),
      description_fr: z.string().trim().max(500).default(''),
      description_en: z.string().trim().max(500).default(''),
      /** Page that presents the feed (e.g. a curation page on a website). */
      site_url: z.union([z.url({ protocol: /^https?$/ }), z.literal('')]).default(''),
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

/**
 * Configs written before kinds were editable hold `categories` (same shape, unused
 * then) or nothing: they get the default kinds.
 */
function withKinds(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return {}
  const { categories, ...rest } = raw as Record<string, unknown>
  if ('kinds' in rest || !Array.isArray(categories) || !categories.length) return rest
  return { ...rest, kinds: categories }
}

export function parseTopicConfig(raw: unknown): TopicConfig {
  return topicConfigSchema.parse(withKinds(raw))
}

export function safeParseTopicConfig(raw: unknown) {
  return topicConfigSchema.safeParse(withKinds(raw))
}

/** Label of a kind in a language; the key itself for a kind the topic no longer has. */
export function kindLabel(config: Pick<TopicConfig, 'kinds'>, key: string, lang: Lang): string {
  const kind = config.kinds.find((k) => k.key === key)
  return kind ? (lang === 'fr' ? kind.label_fr : kind.label_en) : key
}

export function isModuleEnabled(config: Pick<TopicConfig, 'modules'>, module: TopicModule) {
  return config.modules[module]
}

export function isTopicKind(config: Pick<TopicConfig, 'kinds'>, key: string): boolean {
  return config.kinds.some((k) => k.key === key)
}
