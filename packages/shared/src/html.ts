/**
 * Tiny, dependency-free HTML/XML helpers that run in Workers, browsers and Node.
 * They only read <head>-level metadata; full parsing belongs to the collectors.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  laquo: '\u00ab',
  raquo: '\u00bb',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  hellip: '\u2026',
  ndash: '\u2013',
  mdash: '\u2014',
  agrave: '\u00e0',
  acirc: '\u00e2',
  ccedil: '\u00e7',
  eacute: '\u00e9',
  egrave: '\u00e8',
  ecirc: '\u00ea',
  euml: '\u00eb',
  icirc: '\u00ee',
  iuml: '\u00ef',
  ocirc: '\u00f4',
  ugrave: '\u00f9',
  ucirc: '\u00fb',
  Eacute: '\u00c9',
  Agrave: '\u00c0',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : match
    }
    return ENTITIES[code] ?? ENTITIES[code.toLowerCase()] ?? match
  })
}

function clean(text: string): string {
  return decodeEntities(text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Attributes of a single start tag, names lower-cased. */
export function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([^\s=/<>"']+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  const body = tag.replace(/^<\s*[\w:-]+/, '').replace(/\/?>$/, '')
  for (const m of body.matchAll(re)) {
    const name = m[1]?.toLowerCase()
    if (name) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return attrs
}

/** Page title: og:title first, then <title>. */
export function extractPageTitle(html: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = parseAttributes(tag)
    if ((a.property === 'og:title' || a.name === 'twitter:title') && a.content?.trim()) {
      return clean(a.content)
    }
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return title && clean(title) ? clean(title) : null
}

export type FeedFormat = 'rss' | 'atom' | 'rdf'

/** Recognises an RSS 2.0, Atom or RSS 1.0 (RDF) document from its root element. */
export function detectFeedFormat(text: string): FeedFormat | null {
  const head = text
    .slice(0, 4000)
    .replace(/^﻿/, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .trimStart()
  if (/^<rss\b/i.test(head)) return 'rss'
  if (/^<feed\b/i.test(head)) return 'atom'
  if (/^<rdf:RDF\b/i.test(head)) return 'rdf'
  return null
}

/** First <title> of a feed (the channel/feed title, which precedes the entries). */
export function extractFeedTitle(xml: string): string | null {
  const title = xml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return title && clean(title) ? clean(title) : null
}

const FEED_TYPES = new Set([
  'application/rss+xml',
  'application/atom+xml',
  'application/rdf+xml',
  'application/feed+json',
])

export interface DiscoveredFeed {
  url: string
  title: string | null
  type: string
}

/** Feeds declared by a page with <link rel="alternate" type="application/rss+xml" href="…">. */
export function discoverFeeds(html: string, baseUrl: string): DiscoveredFeed[] {
  const found = new Map<string, DiscoveredFeed>()
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const a = parseAttributes(tag)
    const rel = (a.rel ?? '').toLowerCase().split(/\s+/)
    const type = (a.type ?? '').toLowerCase().split(';')[0]?.trim() ?? ''
    if (!rel.includes('alternate') || !FEED_TYPES.has(type) || !a.href) continue
    try {
      const url = new URL(a.href, baseUrl).toString()
      if (!found.has(url)) found.set(url, { url, title: a.title ? clean(a.title) : null, type })
    } catch {
      // invalid href: skip
    }
  }
  return [...found.values()]
}
