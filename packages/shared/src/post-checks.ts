/**
 * Accessibility check of a post: what makes it hard to follow with a screen reader or
 * for some readers. A function of the tool (warnings, never a block, can be turned off
 * per topic), not a style rule given to the AI.
 */
export const POST_ISSUES = [
  /** A hashtag of several words in one case: read as a single word or letter by letter. */
  'hashtag_case',
  /** An emoji at the start of a line (used as a bullet): read before every line. */
  'emoji_line_start',
  /** Many emoji: each one is read out by its full name. */
  'emoji_many',
  /** Emoji in a row: a long list of names read out. */
  'emoji_run',
  /** "Styled" Unicode letters (bold, italic, circled…): skipped or spelled out. */
  'styled_text',
  /** Words in capitals: harder to read, sometimes spelled out. */
  'all_caps',
] as const
export type PostIssueCode = (typeof POST_ISSUES)[number]

export interface PostIssue {
  code: PostIssueCode
  /** What triggered it: the hashtag, the characters, the count… */
  detail?: string
}

const EMOJI = /\p{Extended_Pictographic}/u
const EMOJI_ALL = /\p{Extended_Pictographic}/gu
/** Emoji and their joiners and modifiers: one visible emoji. */
const EMOJI_RUN = /(?:\p{Extended_Pictographic}[\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]*){3,}/u
/**
 * Letters drawn from other Unicode blocks to look bold, italic, script, circled,
 * squared or full width.
 */
const STYLED =
  /[\u{1D400}-\u{1D7FF}\u{FF21}-\u{FF3A}\u{FF41}-\u{FF5A}\u{24B6}-\u{24E9}\u{1F130}-\u{1F189}]/u
const HASHTAG = /(?:^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]{2,})/gu
const WORD = /[\p{L}]+/gu

export const MAX_EMOJI = 5
/** A hashtag of one case longer than this is likely several words joined. */
const LONG_HASHTAG = 12

export function checkPost(text: string): PostIssue[] {
  const issues: PostIssue[] = []

  for (const [, tag] of text.matchAll(HASHTAG)) {
    const letters = tag!.replace(/[^\p{L}]/gu, '')
    // Acronyms (#WCAG, #RGAA) are fine in capitals; longer ones are likely words.
    const upper = letters === letters.toUpperCase() && letters.length > 6
    const lower = letters === letters.toLowerCase() && letters.length > LONG_HASHTAG
    if ((upper && letters !== letters.toLowerCase()) || lower)
      issues.push({ code: 'hashtag_case', detail: `#${tag}` })
  }

  if (text.split('\n').some((line) => EMOJI.test(line.trimStart().slice(0, 2))))
    issues.push({ code: 'emoji_line_start' })
  const emojiCount = (text.match(EMOJI_ALL) ?? []).length
  if (emojiCount > MAX_EMOJI) issues.push({ code: 'emoji_many', detail: String(emojiCount) })
  const run = text.match(EMOJI_RUN)
  if (run) issues.push({ code: 'emoji_run', detail: run[0] })

  const styled = text.match(STYLED)
  if (styled) issues.push({ code: 'styled_text', detail: styled[0] })

  // Three words or more in capitals in a row (acronyms alone are fine).
  const words = [...text.matchAll(WORD)].map((m) => m[0])
  let caps = 0
  for (const word of words) {
    caps =
      word.length >= 2 && word === word.toUpperCase() && word !== word.toLowerCase() ? caps + 1 : 0
    if (caps >= 3) {
      issues.push({ code: 'all_caps' })
      break
    }
  }
  return issues
}
