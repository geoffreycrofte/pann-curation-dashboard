import { langName, type TopicConfig } from '@pann/shared'
import { z } from 'zod'

/** Bump when the prompt changes, to compare and re-run. Stored with each triage. */
export const TRIAGE_PROMPT_VERSION = 'triage-v4'

/** Recent items of the topic shown to the model, to spot the same story told twice. */
export const TRIAGE_RECENT_ITEMS = 40

/** Characters of content sent to the model: triage does not need the whole article. */
export const TRIAGE_CONTENT_CHARS = 6000

/** The kind is one of the keys of the topic kinds (at least one, see the topic config). */
export function triageOutputSchema(kindKeys: readonly string[]) {
  return z.object({
    language: z
      .string()
      .describe(
        'Language tag (ISO 639-1 code, region if useful) of the item content, e.g. "en" or "fr"',
      ),
    kind: z.enum(kindKeys as [string, ...string[]]),
    relevance: z.number().int().describe('0 to 100'),
    commercial: z.boolean(),
    reason: z.string().describe('One short sentence explaining the score'),
    same_story_as: z
      .number()
      .int()
      .describe('Number of the recent item that reports the same story, or 0 when none'),
  })
}
export type TriageOutput = z.infer<ReturnType<typeof triageOutputSchema>>

export interface TriageTopic {
  name_en: string
  config: TopicConfig
}

/** Stable per topic, so it does not vary between items. */
export function triageSystemPrompt(topic: TriageTopic): string {
  const lang = topic.config.output_langs[0] ?? 'en'
  const criteria = topic.config.ai.relevance_criteria.trim() || topic.name_en
  // Kinds and their definitions are topic settings, written by the user.
  const kinds = topic.config.kinds
    .map((k) => `  - ${k.key}: ${k.description.trim() || `${k.label_en} / ${k.label_fr}`}`)
    .join('\n')
  return `You triage items collected for a content-curation board. A person reviews the board and keeps only the most useful items for a professional audience.

Topic: ${topic.name_en}
Relevance criteria: ${criteria}

For each item, return:
- language: Language tag (ISO 639-1 code, region if useful) of the item content.
- kind: the key of the kind of content that fits best, among:
${kinds}
- relevance from 0 to 100, for someone who follows this topic professionally:
  80-100: central to the topic, new, substantial.
  50-79: relevant but secondary, or a minor update.
  20-49: tangential: the topic is only mentioned.
  0-19: unrelated, empty, or spam.
- commercial: true when the item mainly promotes its author's product or service (sales page, advertorial, webinar pitch); false for neutral news, documentation or open-source tools.
- reason: one short sentence explaining the score.
- same_story_as: the number of a recent item of the topic (listed after the content) that reports the same story: the same news, release or event, told by another site or in other words. A different article on the same general subject is not the same story. 0 when none, or when no recent item is listed.

Judge only from the content provided, never from memory. If the content is missing or too short, judge from the title and URL and lower the relevance. Lower the relevance of commercial items unless they announce a substantial new tool or fact.
Write the reason in ${langName(lang, 'en')}.`
}

export interface TriageItem {
  title: string
  canonical_url: string
  published_at: string | null
  fetched_content: string | null
  /** Recent items of the same topic, numbered from 1 in the message. */
  recent?: { item_id: string; title: string }[]
}

export function triageUserMessage(item: TriageItem): string {
  const content = (item.fetched_content ?? '').slice(0, TRIAGE_CONTENT_CHARS).trim()
  return [
    `Title: ${item.title}`,
    `URL: ${item.canonical_url}`,
    item.published_at ? `Published: ${item.published_at.slice(0, 10)}` : null,
    '',
    'Content:',
    content || '(no content available)',
    ...(item.recent?.length
      ? ['', 'Recent items of the topic:', ...item.recent.map((r, i) => `${i + 1}. ${r.title}`)]
      : []),
  ]
    .filter((line) => line !== null)
    .join('\n')
}
