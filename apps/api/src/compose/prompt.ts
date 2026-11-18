import {
  bodyLimit,
  langName,
  type ComposeMode,
  type DraftChannel,
  type Lang,
  type TopicConfig,
} from '@pann/shared'
import { z } from 'zod'
import { langList } from '../draft/prompt'

/** Bump when the prompt changes. Stored in usage_log units. */
export const COMPOSE_PROMPT_VERSION = 'compose-v1'
/** Characters of each source text sent to the model. */
export const SOURCE_CHARS = 8_000
/** At most this many sources are read for one composition. */
export const MAX_SOURCES = 5

const byLang = (langs: readonly Lang[]) =>
  z.object(
    Object.fromEntries(
      langs.map((lang) => [lang, z.string().describe(`Post written in ${langName(lang, 'en')}`)]),
    ),
  )

export function composeOutputSchema(channels: readonly DraftChannel[], langs: readonly Lang[]) {
  return z.object({
    insufficient_material: z
      .boolean()
      .describe('true when the notes and sources give nothing to write a post from'),
    posts: z.object(Object.fromEntries(channels.map((c) => [c, byLang(langs)]))),
  })
}

export interface ComposeOutput {
  insufficient_material: boolean
  posts: Partial<Record<DraftChannel, Record<Lang, string>>>
}

const GROUNDING: Record<ComposeMode, string> = {
  notes: `- The material is the person's own notes. Use only what they say: you may reorder, tighten and adapt it to each network, never add a fact, number, date, name, quote or claim that is not in the notes.
- If the notes are empty or give nothing to write about, set insufficient_material to true.`,
  links: `- The material is the person's notes and the texts of the sources they chose. Use only that material; never add facts from memory.
- Never write a number, date, version or name that is not in the material. Attribute what a source claims to that source.
- If the material is missing or too thin, set insufficient_material to true.`,
  search: `- The material is the person's notes and the texts of the sources they chose among search results. Use only that material; never add facts from memory.
- Never write a number, date, version or name that is not in the material. Attribute what a source claims to that source.
- If the material is missing or too thin, set insufficient_material to true.`,
}

/**
 * Only how the tool works: grounding in the material of the chosen mode, output
 * contract, length limits. Voice and rules come from the topic settings, written by
 * the person (ai.style_rules, ai.post_rules, ai.editorial_rules).
 */
export function composeSystemPrompt(
  topic: { name_en: string; config: TopicConfig },
  mode: ComposeMode,
): string {
  const { editorial_rules, style_rules, post_rules } = topic.config.ai
  const section = (title: string, rules: string) =>
    rules.trim() ? `\n\n# ${title}\n${rules.trim()}` : ''
  return `You write social media posts for a person who makes this known: ${topic.name_en}. They publish in these languages: ${langList(topic.config.output_langs)}.
From their subject and material, you write one post per network and per language.

# Grounding
${GROUNDING[mode]}

# Posts
- Do not include a link: when there is one, it is appended after the text, separated by a blank line.
- One post per language: each post is entirely in its language, written natively, not translated word for word.
- Respect the length limit given for the text of each network, counting every character.${section('Topic rules', editorial_rules)}${section('Style rules', style_rules)}${section('Post rules', post_rules)}`
}

export interface ComposeMaterial {
  subject: string
  notes: string
  link: string
  sources: { url: string; title: string; text: string }[]
}

export function composeUserMessage(
  material: ComposeMaterial,
  channels: readonly DraftChannel[],
  signatures: Partial<Record<DraftChannel, string>> = {},
): string {
  const sources = material.sources.slice(0, MAX_SOURCES)
  return [
    `Subject: ${material.subject.trim() || '(none given)'}`,
    `Maximum length of the text of each post: ${channels
      .map((c) => `${c} ${bodyLimit(c, material.link, undefined, signatures[c])}`)
      .join(', ')} characters.`,
    '',
    'Notes of the person:',
    material.notes.trim() || '(none)',
    ...sources.flatMap((source, index) => [
      '',
      `Source ${index + 1}: ${source.title} (${source.url})`,
      source.text.slice(0, SOURCE_CHARS).trim() || '(no text available)',
    ]),
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Text alternatives of images
// ---------------------------------------------------------------------------

export const ALT_PROMPT_VERSION = 'alt-v1'

export function altOutputSchema(langs: readonly Lang[]) {
  return z.object({
    alt: z.object(
      Object.fromEntries(
        langs.map((lang) => [
          lang,
          z.string().describe(`Text alternative written in ${langName(lang, 'en')}`),
        ]),
      ),
    ),
  })
}

/** How a text alternative is written: purpose and length only, no style. */
export function altSystemPrompt(langs: readonly Lang[]): string {
  return `You write the text alternative of an image that will be published in a social media post, for people who cannot see it. Write one in each of these languages: ${langList(langs)}.
- Describe what matters in the image for the post: its content and, if any, the text it shows (transcribe short text exactly).
- One or two sentences, at most 300 characters. Do not start with "Image of" or "Picture of".
- Describe only what is visible; do not guess names or facts that the image does not show.`
}
