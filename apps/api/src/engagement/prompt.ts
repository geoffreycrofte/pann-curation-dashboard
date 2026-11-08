import {
  ENGAGEMENT_DECISIONS,
  ENGAGEMENT_RISKS,
  type ConversationMeta,
  type Lang,
  type TopicConfig,
} from '@pann/shared'
import { z } from 'zod'

/** Bump when the prompt changes. Stored with the usage of each triage. */
export const ENGAGEMENT_PROMPT_VERSION = 'engagement-triage-v1'

/** Characters of the conversation sent to the model. */
export const ENGAGEMENT_CONTENT_CHARS = 4000

export const engagementOutputSchema = z.object({
  language: z.string().describe('ISO 639-1 code of the conversation, e.g. "en" or "fr"'),
  opportunity: z.number().int().describe('0 to 100'),
  decision: z.enum(ENGAGEMENT_DECISIONS),
  angle: z.string().describe('How a reply could help, in one sentence; empty when skipping'),
  risk: z.enum(ENGAGEMENT_RISKS),
  reason: z.string().describe('One short sentence explaining the decision'),
})
export type EngagementOutput = z.infer<typeof engagementOutputSchema>

const LANG_NAMES: Record<Lang, string> = { fr: 'French', en: 'English' }

export interface EngagementTopic {
  name_en: string
  config: TopicConfig
}

/**
 * How the tool judges a conversation is built in (help first, honesty, community
 * respect: docs/engagement/brief.md). What the product is and what makes a
 * conversation worth joining are topic settings written by the user.
 */
export function engagementSystemPrompt(topic: EngagementTopic): string {
  const { product, engagement } = topic.config
  const lang = topic.config.output_langs[0] ?? 'en'
  const field = (label: string, value: string) =>
    value.trim() ? `\n${label}: ${value.trim()}` : ''
  const productBlock =
    [
      field('Name', product.name || topic.name_en),
      field('Website', product.url),
      field('What it is', product.description),
      field('Audience', product.audience),
      field('Messages', product.messages),
      field('Never claim', product.claims_to_avoid),
    ].join('') || `\nName: ${topic.name_en}`
  return `You review public conversations (Hacker News, Bluesky) for the team behind a product. The team wants to join only the conversations where a reply from them would genuinely help the people in it. Nothing is ever posted automatically: a person reads your assessment, writes a reply and posts it themselves.

# The product (set by the team)${productBlock}${engagement.criteria.trim() ? `\n\n# Conversations worth joining (set by the team)\n${engagement.criteria.trim()}` : ''}

# For each conversation, return
- language: ISO 639-1 code of the conversation.
- opportunity from 0 to 100:
  80-100: someone describes a concrete problem or asks for a method or a tool in the product's area, and a reply can help right now.
  60-79: the problem is relevant and a useful reply is possible, without needing to mention the product.
  40-59: related to the product's area, but there is no clear need to answer: worth watching.
  0-39: off topic, hostile, already well answered, a request to hire someone or for a quote, or a promotion.
- decision: reply (opportunity 60 or more and a useful reply is possible), watch, or skip.
- angle: in one sentence, how a reply could help the person (the help, not the product). Empty when skipping.
- risk: low, medium or high, for the team replying there: hostile tone, community rules against self-promotion, legal or medical advice expected, or a thread where any mention of the product would look like spam.
- reason: one short sentence explaining the decision.

Help comes first: a conversation where a reply would be useful only by mentioning the product is a skip. Do not mistake a technical question for an intent to buy, and do not overrate buying intent. Lower the opportunity of old or inactive threads. Judge only from the conversation provided.
Write the reason and the angle in ${LANG_NAMES[lang]}.`
}

export interface EngagementItem {
  title: string
  canonical_url: string
  published_at: string | null
  fetched_content: string | null
  meta: ConversationMeta
}

export function engagementUserMessage(item: EngagementItem): string {
  const { meta } = item
  const content = (item.fetched_content ?? '').slice(0, ENGAGEMENT_CONTENT_CHARS).trim()
  return [
    `Platform: ${meta.platform ?? 'unknown'}`,
    meta.thread_title ? `Thread: ${meta.thread_title}` : `Title: ${item.title}`,
    `URL: ${item.canonical_url}`,
    item.published_at ? `Posted: ${item.published_at.slice(0, 10)}` : null,
    meta.points != null ? `Points or likes: ${meta.points}` : null,
    meta.comments != null ? `Replies: ${meta.comments}` : null,
    '',
    'Conversation:',
    content || '(no text available)',
  ]
    .filter((line) => line !== null)
    .join('\n')
}
