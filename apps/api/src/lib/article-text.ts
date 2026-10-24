import { htmlToText } from '../collect/feed-parser'

/**
 * Readable text of an article page: the <article> element, else <main>, else <body>,
 * without navigation, headers, footers and forms. Good enough for summarising.
 */
export function extractArticleText(html: string, maxLength = 30_000): string {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside)\b[\s\S]*?<\/\1>/gi, ' ')
  const pick = (tag: string) =>
    cleaned.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]
  const main = pick('article') ?? pick('main') ?? pick('body') ?? cleaned
  return htmlToText(main, maxLength)
}
