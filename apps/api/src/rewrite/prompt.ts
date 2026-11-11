import { DRAFT_CHANNELS, LANGS, type DraftChannel, type TopicConfig } from '@pann/shared'
import { z } from 'zod'

/** Bump when the prompt changes. Stored with the usage of each rewrite. */
export const REWRITE_PROMPT_VERSION = 'rewrite-v1'

export const REWRITE_PRESETS = ['shorter', 'longer', 'formal', 'casual', 'custom'] as const
export type RewritePreset = (typeof REWRITE_PRESETS)[number]

/** What the person asked for, as an instruction to the model (the choice is theirs). */
const PRESET_INSTRUCTIONS: Record<Exclude<RewritePreset, 'custom'>, string> = {
  shorter: 'Make it noticeably shorter, keeping the essential information.',
  longer: 'Make it a little longer, developing what the text already says.',
  formal: 'Make the tone more professional.',
  casual: 'Make the tone more casual and conversational.',
}

export const rewriteRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(5000),
    preset: z.enum(REWRITE_PRESETS),
    instruction: z.string().trim().max(500).optional(),
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('summary'), lang: z.enum(LANGS) }),
      z.object({ kind: z.literal('post'), lang: z.enum(LANGS), channel: z.enum(DRAFT_CHANNELS) }),
    ]),
  })
  .refine((r) => r.preset !== 'custom' || !!r.instruction, {
    message: 'A custom rewrite needs an instruction',
  })
export type RewriteRequest = z.infer<typeof rewriteRequestSchema>

const LANG_NAMES = { fr: 'French', en: 'English' } as const
const CHANNEL_NAMES: Record<DraftChannel, string> = {
  linkedin: 'LinkedIn',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  x: 'X',
  facebook: 'Facebook',
  discord: 'Discord',
}

/**
 * Only how the tool works: keep the facts, the language, the length limit of a post.
 * Style rules come from the topic settings, written by the user.
 */
export function rewriteSystemPrompt(
  topic: { name_en: string; config: TopicConfig },
  target: RewriteRequest['target'],
  /** Posts: characters available for the text, the link being appended after it. */
  maxChars?: number,
): string {
  const rules = target.kind === 'summary' ? topic.config.ai.style_rules : topic.config.ai.post_rules
  const what =
    target.kind === 'summary'
      ? 'a summary of a source, shown in a newsletter and in public feeds'
      : `a ${CHANNEL_NAMES[target.channel]} post about a source; the link to the source is appended automatically after the text, so never write a URL`
  return `You rewrite ${what}, for a content-curation service about: ${topic.name_en}.

Follow the instruction of the user. Keep every fact, figure, name and version exactly as in the text, and never add a fact that is not in it. Write in ${LANG_NAMES[target.lang]}, as a native writer would.${maxChars ? ` The text must not exceed ${maxChars} characters.` : ''}
Answer with the rewritten text only: no title, no quotation marks, no comment.${rules.trim() ? `\n\n# Rules set by the user\n${rules.trim()}` : ''}`
}

export function rewriteUserMessage(request: RewriteRequest): string {
  const instruction =
    request.preset === 'custom' ? request.instruction! : PRESET_INSTRUCTIONS[request.preset]
  return `Instruction: ${instruction}\n\nText:\n${request.text}`
}
