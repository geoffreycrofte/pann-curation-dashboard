import { POST_LIMITS, SOURCE_NATURES_LIST, type TopicConfig } from '@pann/shared'
import { z } from 'zod'

/** Bump when the prompt changes. Stored with each summary (summaries.prompt_version). */
export const DRAFT_PROMPT_VERSION = 'draft-v1'

/** Characters of the source sent for drafting. */
export const DRAFT_CONTENT_CHARS = 24_000

const postsByLang = z.object({ fr: z.string(), en: z.string() })

export const draftOutputSchema = z.object({
  insufficient_content: z
    .boolean()
    .describe('true when the content is missing, paywalled or too thin to summarise'),
  summary_fr: z.string(),
  summary_en: z.string(),
  key_excerpt: z
    .string()
    .describe('Verbatim quote of at most 25 words, in the language of the source'),
  source_type: z.enum(SOURCE_NATURES_LIST),
  posts: z.object({
    linkedin: postsByLang,
    bluesky: postsByLang,
    mastodon: postsByLang,
  }),
})
export type DraftOutput = z.infer<typeof draftOutputSchema>

/**
 * Editorial rules from docs/CONTEXT.md (section 5), stable for all items of a topic so
 * that the prompt cache is reused between items. Topic-specific rules come last.
 */
export function draftSystemPrompt(topic: { name_en: string; config: TopicConfig }): string {
  const extra = topic.config.ai.editorial_rules.trim()
  return `You write the editorial material of a bilingual (French and English) content-curation service about: ${topic.name_en}.
For one source item, you produce a summary in French, a summary in English, a short verbatim excerpt, the nature of the source, and social media post drafts in both languages.

# Accuracy (most important)
- Use only the source content provided. Never add facts from memory.
- Never write a number, date, version, criterion number or article number that is not in the provided content.
- Distinguish a European directive from its national transposition, and name the country when the text concerns one.
- For a standard or reference framework, quote the exact version given in the source (for example RGAA 4.1 and RGAA 5 are different texts).
- If the content is missing, paywalled, empty or too thin to summarise faithfully, set insufficient_content to true and keep the other text fields as short placeholders. Do not fill the gaps.
- Commercial sources describe what a company claims about itself: write "according to <company>" / "selon <entreprise>", not as established facts.
- source_type: institutional (public body), regulatory (law, regulation, standard, court decision), primary (original announcement, release notes, research by the authors), expert (practitioner or specialist publication), press (journalism), commercial (vendor marketing).
- key_excerpt: a verbatim quote of 25 words or fewer, copied exactly from the source, in the source language.

# Style
- Summaries: 2 to 3 short sentences, factual tone, reworded (no close paraphrase of the source).
- Write French and English each natively, not as a word-for-word translation of the other.
- French typography: never use an em dash or a double hyphen; put a non-breaking space before : ; ! ? and inside « ».
- Inclusive language: no "point médian"; prefer neutral wording ("l'équipe de développement"); say "personnes handicapées" or "personnes en situation de handicap" (EN: "disabled people" or "people with disabilities").
- Banned expressions: "personne avec des besoins spécifiques" and its variants, "au jour d'aujourd'hui".

# Posts
- Each post presents the item in a natural voice for its network, says why it matters, and does not include the link (it is added separately).
- Respect the length limits, counting every character: LinkedIn ${POST_LIMITS.linkedin} (aim for 400 to 900), Bluesky ${POST_LIMITS.bluesky}, Mastodon ${POST_LIMITS.mastodon}.
- At most 2 hashtags on Bluesky and Mastodon, at most 3 on LinkedIn, written in CamelCase for screen readers (#DigitalAccessibility).
- No emoji used as bullet points or to replace words.${extra ? `\n\n# Topic rules\n${extra}` : ''}`
}

export interface DraftSource {
  title: string
  canonical_url: string
  published_at: string | null
  source_lang: string | null
  content: string
}

export function draftUserMessage(item: DraftSource): string {
  return [
    `Title: ${item.title}`,
    `URL: ${item.canonical_url}`,
    item.published_at ? `Published: ${item.published_at.slice(0, 10)}` : null,
    item.source_lang ? `Source language: ${item.source_lang}` : null,
    '',
    'Source content:',
    item.content.slice(0, DRAFT_CONTENT_CHARS).trim() || '(no content available)',
  ]
    .filter((line) => line !== null)
    .join('\n')
}
