import { ITEM_KINDS, type Lang, type TopicConfig } from '@pann/shared'
import { z } from 'zod'

/** Bump when the prompt changes, to compare and re-run. Stored with each triage. */
export const TRIAGE_PROMPT_VERSION = 'triage-v2'

/** Characters of content sent to the model: triage does not need the whole article. */
export const TRIAGE_CONTENT_CHARS = 6000

export const triageOutputSchema = z.object({
  language: z.string().describe('ISO 639-1 code of the item content, e.g. "en" or "fr"'),
  kind: z.enum(ITEM_KINDS),
  relevance: z.number().int().describe('0 to 100'),
  commercial: z.boolean(),
  reason: z.string().describe('One short sentence explaining the score'),
})
export type TriageOutput = z.infer<typeof triageOutputSchema>

const LANG_NAMES: Record<Lang, string> = { fr: 'French', en: 'English' }

export interface TriageTopic {
  name_en: string
  config: TopicConfig
}

/** Stable per topic, so it does not vary between items. */
export function triageSystemPrompt(topic: TriageTopic): string {
  const lang = topic.config.output_langs[0] ?? 'en'
  const criteria = topic.config.ai.relevance_criteria.trim() || topic.name_en
  return `You triage items collected for a content-curation board. A person reviews the board and keeps only the most useful items for a professional audience.

Topic: ${topic.name_en}
Relevance criteria: ${criteria}

For each item, return:
- language: ISO 639-1 code of the item content.
- kind: news (announcements, events, industry news), legal (laws, regulations, standards, court or authority decisions, official guidance), tool (software, libraries, extensions, services, new releases), resource (guides, tutorials, articles, research, talks).
- relevance from 0 to 100, for someone who follows this topic professionally:
  80-100: central to the topic, new, substantial.
  50-79: relevant but secondary, or a minor update.
  20-49: tangential: the topic is only mentioned.
  0-19: unrelated, empty, or spam.
- commercial: true when the item mainly promotes its author's product or service (sales page, advertorial, webinar pitch); false for neutral news, documentation or open-source tools.
- reason: one short sentence explaining the score.

Judge only from the content provided, never from memory. If the content is missing or too short, judge from the title and URL and lower the relevance. Lower the relevance of commercial items unless they announce a substantial new tool or fact.
Write the reason in ${LANG_NAMES[lang]}.`
}

export interface TriageItem {
  title: string
  canonical_url: string
  published_at: string | null
  fetched_content: string | null
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
  ]
    .filter((line) => line !== null)
    .join('\n')
}
