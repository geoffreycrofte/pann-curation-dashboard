import { decodeEntities } from '@pann/shared'
import { XMLParser } from 'fast-xml-parser'

export interface FeedEntry {
  url: string
  title: string
  content: string | null
  published_at: string | null
}

export interface ParsedFeed {
  title: string | null
  lang: string | null
  entries: FeedEntry[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  // Entities are decoded by htmlToText / decodeEntities, which also handle HTML ones.
  processEntities: false,
  htmlEntities: false,
  isArray: (name) => ['item', 'entry', 'link'].includes(name),
})

type Node = Record<string, unknown>

function text(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return text(value[0])
  if (typeof value === 'object') return text((value as Node)['#text'])
  return ''
}

/** Plain text from an HTML fragment, for triage (not for display). */
export function htmlToText(html: string, maxLength = 20_000): string {
  // Escaped HTML (Atom type="html", many RSS descriptions): unescape before stripping tags.
  const source = /&lt;[a-z!/]/i.test(html) ? decodeEntities(html) : html
  return decodeEntities(
    source
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .slice(0, maxLength)
}

function toIsoDate(value: unknown): string | null {
  const raw = text(value).trim()
  if (!raw) return null
  const time = Date.parse(raw)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

function rssLink(item: Node): string {
  const links = (item.link as unknown[] | undefined) ?? []
  for (const link of links) {
    const href = typeof link === 'object' && link ? (link as Node)['@_href'] : undefined
    const value = text(href ?? link).trim()
    if (value) return value
  }
  const guid = item.guid
  const permalink = typeof guid === 'object' && guid ? (guid as Node)['@_isPermaLink'] : undefined
  const guidText = text(guid).trim()
  return permalink !== 'false' && /^https?:\/\//.test(guidText) ? guidText : ''
}

function atomLink(entry: Node): string {
  const links = ((entry.link as Node[] | undefined) ?? []).filter((l) => typeof l === 'object')
  const alternate = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate')
  return text(alternate?.['@_href']).trim()
}

function resolve(url: string, base: string | undefined): string {
  try {
    return new URL(url, base).toString()
  } catch {
    return ''
  }
}

/** Parses RSS 2.0, RSS 1.0 (RDF) and Atom. Entries without a usable link are dropped. */
export function parseFeed(xml: string, baseUrl?: string): ParsedFeed {
  const doc = parser.parse(xml) as Node

  const rss = doc.rss as Node | undefined
  const rdf = doc['rdf:RDF'] as Node | undefined
  const atom = doc.feed as Node | undefined

  if (rss || rdf) {
    const channel = ((rss?.channel ?? rdf?.channel) as Node | undefined) ?? {}
    const items = ((rss ? channel.item : rdf?.item) as Node[] | undefined) ?? []
    return {
      title: htmlToText(text(channel.title)) || null,
      lang: text(channel.language ?? channel['dc:language']).trim() || null,
      entries: items
        .map((item) => ({
          url: resolve(rssLink(item), baseUrl),
          title: htmlToText(text(item.title), 500),
          content: htmlToText(text(item['content:encoded'] ?? item.description)) || null,
          published_at: toIsoDate(item.pubDate ?? item['dc:date']),
        }))
        .filter((e) => e.url),
    }
  }

  if (atom) {
    const entries = (atom.entry as Node[] | undefined) ?? []
    return {
      title: htmlToText(text(atom.title)) || null,
      lang: text(atom['@_xml:lang']).trim() || null,
      entries: entries
        .map((entry) => ({
          url: resolve(atomLink(entry), baseUrl),
          title: htmlToText(text(entry.title), 500),
          content: htmlToText(text(entry.content ?? entry.summary)) || null,
          published_at: toIsoDate(entry.published ?? entry.updated),
        }))
        .filter((e) => e.url),
    }
  }

  throw new Error('Not an RSS or Atom document')
}
