import { z } from 'zod'
import { DRAFT_MODES } from './domain'
import { langSchema, localizedText, MAX_OUTPUT_LANGS, uiLangFor, type Lang } from './langs'
import { DRAFT_CHANNELS, FIRST_COMMENT_MAX, LINKEDIN_SIGNATURE_MAX } from './drafting'
import { NEWSLETTER_PROVIDERS } from './providers'
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
  /** Labels of the interface (board). */
  label_fr: z.string().trim().min(1).max(60),
  label_en: z.string().trim().min(1).max(60),
  /** Labels in the other content languages (newsletter groups); else the English one. */
  labels: localizedText(60),
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
    labels: {},
    description: 'Announcements, events, industry news.',
  },
  {
    key: 'legal',
    label_fr: 'Légal',
    label_en: 'Legal',
    labels: {},
    description: 'Laws, regulations, standards, court or authority decisions, official guidance.',
  },
  {
    key: 'tool',
    label_fr: 'Outil',
    label_en: 'Tool',
    labels: {},
    description: 'Software, libraries, extensions, services, new releases.',
  },
  {
    key: 'resource',
    label_fr: 'Ressource',
    label_en: 'Resource',
    labels: {},
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

/**
 * Where the content of a composed post comes from (Création tool): the person's notes
 * only, links they give, or sources Pann searches. Chosen per composition.
 */
export const COMPOSE_MODES = ['notes', 'links', 'search'] as const
export type ComposeMode = (typeof COMPOSE_MODES)[number]

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
      /** Création: posts written by the person, with their images. */
      compose: z.boolean().default(false),
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
  /** Languages the topic writes in (summaries, posts, newsletter, feeds): any language. */
  output_langs: z
    .array(langSchema)
    .min(1)
    .max(MAX_OUTPUT_LANGS)
    .refine((langs) => new Set(langs).size === langs.length, {
      message: 'Languages must be unique',
    })
    .default(['fr', 'en']),
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
   * Création tool: its own publication slots (distinct from the news watch's, same
   * time zone) and the mode a new composition starts in.
   */
  compose: z
    .object({
      mode: z.enum(COMPOSE_MODES).default('notes'),
      /** 0 pauses its queue (a composition can still be published "now"). */
      posts_per_day: z.number().int().min(0).max(10).default(1),
      slots: z.array(timeSlot).max(10).default(['12:00']),
    })
    .prefault({}),
  /**
   * Weekly newsletter (Brevo or SendFox): one campaign per output language, sent to the
   * list of that language. Content: the items scheduled or published on the social networks
   * that no earlier issue of this language held.
   */
  newsletter: z
    .object({
      /** Off: the newsletter is only sent from the board ("Send now"). */
      auto_send: z.boolean().default(false),
      /** Service that sends it; its key is set on the Connections page. */
      provider: z.enum(NEWSLETTER_PROVIDERS).default('brevo'),
      /** Brevo sender id (Brevo checks the sender address). SendFox uses the account's sender. */
      sender_id: z.number().int().positive().nullable().default(null),
      /** List of subscribers of each language (service list id). */
      lists: z.record(langSchema, z.number().int().positive().nullable()).default({}),
      /** Name of the newsletter in each language, shown at the top and in the subject. */
      title: localizedText(120),
      /** Short text at the top of each issue, written by the user. */
      intro: localizedText(2000),
      /**
       * Start of the first issue (YYYY-MM-DD): the items scheduled or published since
       * this day. Empty: the last DEFAULT_DIGEST_DAYS days.
       */
      first_issue_from: z.union([z.iso.date(), z.literal('')]).default(''),
      /** Look of the email. Logo: an https image shown above the name (decorative). */
      logo_url: z.union([z.url({ protocol: /^https$/ }), z.literal('')]).default(''),
      /** Decorative color: a band at the top and a mark beside each item (no text on it). */
      accent_color: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .default('#ffc72c'),
      /** Text at the bottom of each issue (who sends it, an address, a link…). */
      footer: localizedText(1000),
      /**
       * Fixed texts of the email written by the user per language (link to the web
       * version, unsubscribe, reason, "other" group). Empty: Pann's own, in French or
       * English (marked as such for screen readers in other languages).
       */
      texts: z
        .record(
          langSchema,
          z.object({
            mirror: z.string().trim().max(120).default(''),
            unsubscribe: z.string().trim().max(120).default(''),
            reason: z.string().trim().max(300).default(''),
            other: z.string().trim().max(60).default(''),
          }),
        )
        .default({}),
      /** Items grouped under the content kinds of the topic, in their order. */
      group_by_kind: z.boolean().default(false),
    })
    .prefault({}),
  /**
   * Public feeds (RSS and JSON Feed), turned on per topic from the board. The feed
   * address itself (topics.feed_key) is not part of the config.
   */
  feed: z
    .object({
      title: localizedText(120),
      description: localizedText(500),
      /** Page that presents the feed (e.g. a curation page on a website). */
      site_url: z.union([z.url({ protocol: /^https?$/ }), z.literal('')]).default(''),
    })
    .prefault({}),
  /**
   * Networks the person said they publish on (onboarding), before any account is
   * connected: their posts are drafted from the start, and the overview asks to connect
   * them. Once an account is chosen (`channels`), the account rules.
   */
  target_channels: z
    .preprocess(
      (value) =>
        Array.isArray(value)
          ? value.filter((c) => (DRAFT_CHANNELS as readonly unknown[]).includes(c))
          : value,
      z.array(z.enum(DRAFT_CHANNELS)),
    )
    .default([]),
  /** The person wants a newsletter (onboarding): the overview asks to set it up. */
  target_newsletter: z.boolean().default(false),
  /**
   * LinkedIn extras, per language (empty = none).
   * - `signature`: text added at the end of every LinkedIn post, after the link
   *   ("I am…, find me on…"). Counted in the 3,000 characters of the post.
   * - `first_comment`: comment published right after each post (through Zernio), e.g. a
   *   link to promote. A post can replace it or turn it off (`posts.first_comment`).
   */
  linkedin: z
    .object({
      signature: localizedText(LINKEDIN_SIGNATURE_MAX),
      first_comment: localizedText(FIRST_COMMENT_MAX),
    })
    .prefault({}),
  /**
   * Where the posts of this topic go: one entry per account, with the languages it
   * publishes (never a bilingual post: one post per language). LinkedIn and Bluesky
   * accounts are Zernio account ids; Mastodon uses the workspace's Mastodon account.
   */
  channels: z.preprocess(
    // Entries written by an older version (account_ref, no languages) are dropped, and so
    // are the channels Pann no longer publishes to (X, left out on 2026-11-12).
    (value) =>
      Array.isArray(value)
        ? value.filter(
            (e) =>
              typeof e === 'object' &&
              e !== null &&
              'account_id' in e &&
              (DRAFT_CHANNELS as readonly unknown[]).includes((e as { channel?: unknown }).channel),
          )
        : value,
    z
      .array(
        z.object({
          channel: z.enum(DRAFT_CHANNELS),
          account_id: z.string().min(1).max(200),
          langs: z.array(langSchema).min(1),
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
 * Older shapes of a stored config, brought to the current one before parsing:
 * - `categories` (before kinds were editable) becomes `kinds`;
 * - texts stored per field and language (`title_fr`, `title_en`) become one text per
 *   language (`title: { fr, en }`), since contents can be in any language (2026-11-17).
 */
function withKinds(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return {}
  const { categories, ...rest } = raw as Record<string, unknown>
  const config: Record<string, unknown> =
    'kinds' in rest || !Array.isArray(categories) || !categories.length
      ? rest
      : { ...rest, kinds: categories }
  for (const [section, fields] of [
    ['newsletter', ['title', 'intro', 'footer']],
    ['feed', ['title', 'description']],
  ] as const) {
    const value = config[section]
    if (value && typeof value === 'object')
      config[section] = liftLocalized(value as Record<string, unknown>, fields)
  }
  return config
}

function liftLocalized(
  section: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const next = { ...section }
  for (const field of fields) {
    const fr = next[`${field}_fr`]
    const en = next[`${field}_en`]
    delete next[`${field}_fr`]
    delete next[`${field}_en`]
    if (field in next) continue
    const texts: Record<string, string> = {}
    if (typeof fr === 'string' && fr) texts.fr = fr
    if (typeof en === 'string' && en) texts.en = en
    next[field] = texts
  }
  return next
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
  if (!kind) return key
  return kind.labels[lang] || (uiLangFor(lang) === 'fr' ? kind.label_fr : kind.label_en)
}

export function isModuleEnabled(config: Pick<TopicConfig, 'modules'>, module: TopicModule) {
  return config.modules[module]
}

export function isTopicKind(config: Pick<TopicConfig, 'kinds'>, key: string): boolean {
  return config.kinds.some((k) => k.key === key)
}
