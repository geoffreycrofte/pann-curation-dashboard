import {
  bodyLimit,
  langName,
  SOURCE_NATURES_LIST,
  type DraftChannel,
  type Lang,
  type TopicConfig,
} from '@pann/shared'
import { z } from 'zod'

/** Bump when the prompt changes. Stored with each summary (summaries.prompt_version). */
export const DRAFT_PROMPT_VERSION = 'draft-v4'

/** Characters of the source sent for drafting. */
export const DRAFT_CONTENT_CHARS = 24_000

/** A text per language of the topic, each key a BCP 47 tag (`fr`, `de`, `pt-BR`…). */
const byLang = (langs: readonly Lang[], what: string) =>
  z.object(
    Object.fromEntries(
      langs.map((lang) => [
        lang,
        z.string().describe(`${what}, written in ${langName(lang, 'en')}`),
      ]),
    ),
  )

/**
 * Output of a drafting call, in the languages of the topic (any language). Posts are asked
 * only for the channels of the topic (draftChannels): a topic that does not publish to a
 * network gets no post for it, and pays for none.
 */
export function draftOutputSchema(channels: readonly DraftChannel[], langs: readonly Lang[]) {
  return z.object({
    insufficient_content: z
      .boolean()
      .describe('true when the content is missing, paywalled or too thin to summarise'),
    summaries: byLang(langs, 'Summary'),
    key_excerpt: z
      .string()
      .describe('Verbatim quote of at most 25 words, in the language of the source'),
    source_type: z.enum(SOURCE_NATURES_LIST),
    posts: z.object(Object.fromEntries(channels.map((c) => [c, byLang(langs, 'Post')]))),
  })
}

export interface DraftOutput {
  insufficient_content: boolean
  summaries: Record<Lang, string>
  key_excerpt: string
  source_type: (typeof SOURCE_NATURES_LIST)[number]
  posts: Partial<Record<DraftChannel, Record<Lang, string>>>
}

/** "French (fr), German (de)": the languages as the model reads them. */
export function langList(langs: readonly Lang[]): string {
  return langs.map((lang) => `${langName(lang, 'en')} (${lang})`).join(', ')
}

/**
 * Only how the tool works is built in: grounding in the source, output contract,
 * length limits of each network. Style, voice and topic-specific rules come from the
 * topic settings (ai.editorial_rules, ai.style_rules, ai.post_rules), written by the
 * user. Stable for all items of a topic, so the prompt cache is reused between items.
 */
export function draftSystemPrompt(topic: { name_en: string; config: TopicConfig }): string {
  const { editorial_rules, style_rules, post_rules } = topic.config.ai
  const section = (title: string, rules: string) =>
    rules.trim() ? `\n\n# ${title}\n${rules.trim()}` : ''
  const langs = langList(topic.config.output_langs)
  return `You prepare the editorial material of a content-curation service about: ${topic.name_en}. It publishes in these languages: ${langs}.
For one source item, you produce a summary in each of these languages, a short verbatim excerpt, the nature of the source, and social media post drafts in each of these languages.

# Grounding
- Use only the source content provided. Never add facts from memory.
- Never write a number, date, version or reference that is not in the provided content.
- If the content is missing, paywalled, empty or too thin to summarise faithfully, set insufficient_content to true and keep the other text fields as short placeholders. Do not fill the gaps.
- Commercial sources describe what a company claims about itself: attribute the claims to the company, do not present them as established facts.
- source_type: institutional (public body), regulatory (law, regulation, standard, court decision), primary (original announcement, release notes, research by the authors), expert (practitioner or specialist publication), press (journalism), commercial (vendor marketing).
- key_excerpt: a verbatim quote of 25 words or fewer, copied exactly from the source, in the source language.

# Summaries
- Reworded in your own words, never a close paraphrase of the source (the original is linked separately).
- Each language is written natively, not as a word-for-word translation of another.

# Posts
- Each post presents the item and why it matters. Do not include the link: it is appended after the text, separated by a blank line.
- One post per language: each post is entirely in its language.
- Respect the length limits given with the item for the text of each post, counting every character (they already leave room for the link).${section('Topic rules', editorial_rules)}${section('Style rules', style_rules)}${section('Post rules', post_rules)}`
}

export interface DraftSource {
  title: string
  canonical_url: string
  published_at: string | null
  source_lang: string | null
  content: string
}

/**
 * `signatures`: text added at the end of the posts of a channel (LinkedIn), the longest of
 * its languages; the limit given to the model leaves room for it.
 */
export function draftUserMessage(
  item: DraftSource,
  channels: readonly DraftChannel[],
  signatures: Partial<Record<DraftChannel, string>> = {},
): string {
  return [
    `Title: ${item.title}`,
    `URL: ${item.canonical_url}`,
    item.published_at ? `Published: ${item.published_at.slice(0, 10)}` : null,
    item.source_lang ? `Source language: ${item.source_lang}` : null,
    `Maximum length of the text of each post: ${channels
      .map(
        (channel) =>
          `${channel} ${bodyLimit(channel, item.canonical_url, undefined, signatures[channel])}`,
      )
      .join(', ')} characters.`,
    '',
    'Source content:',
    item.content.slice(0, DRAFT_CONTENT_CHARS).trim() || '(no content available)',
  ]
    .filter((line) => line !== null)
    .join('\n')
}
