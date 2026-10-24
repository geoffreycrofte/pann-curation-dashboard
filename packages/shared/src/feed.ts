import { escapeHtml } from './digest'
import type { Lang } from './domain'

export const PUBLIC_FEED_FORMATS = ['xml', 'json'] as const
export type PublicFeedFormat = (typeof PUBLIC_FEED_FORMATS)[number]

/** Random part of a feed address: 32 URL-safe characters (192 bits). */
export const FEED_KEY_PATTERN = /^[A-Za-z0-9_-]{24,64}$/

export function newFeedKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Path of a feed, relative to the origin of the app. */
export function feedPath(key: string, lang: Lang, format: PublicFeedFormat): string {
  return `/feeds/${key}/${lang}.${format}`
}

export interface FeedEntry {
  id: string
  url: string
  title: string
  source_lang: string | null
  summary: string
  /** Date the item was validated: when it entered the curation. */
  validated_at: string
}

export interface FeedInput {
  lang: Lang
  title: string
  description: string
  /** Absolute address of this feed. */
  self_url: string
  /** Page that presents the feed; the app origin when none is set. */
  site_url: string
  entries: FeedEntry[]
}

/** RSS 2.0, with an atom:link to itself as feed validators expect. */
export function renderRss(feed: FeedInput): string {
  const items = feed.entries
    .map(
      (e) => `    <item>
      <title>${escapeHtml(e.title)}</title>
      <link>${escapeHtml(e.url)}</link>
      <guid isPermaLink="false">urn:uuid:${escapeHtml(e.id)}</guid>
      <pubDate>${new Date(e.validated_at).toUTCString()}</pubDate>
      <description>${escapeHtml(e.summary)}</description>
    </item>`,
    )
    .join('\n')
  const updated = feed.entries[0]?.validated_at
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(feed.title)}</title>
    <link>${escapeHtml(feed.site_url)}</link>
    <atom:link href="${escapeHtml(feed.self_url)}" rel="self" type="application/rss+xml"/>
    <description>${escapeHtml(feed.description || feed.title)}</description>
    <language>${feed.lang}</language>${updated ? `\n    <lastBuildDate>${new Date(updated).toUTCString()}</lastBuildDate>` : ''}
${items}
  </channel>
</rss>
`
}

/** JSON Feed 1.1 (https://www.jsonfeed.org/version/1.1/). */
export function renderJsonFeed(feed: FeedInput): string {
  return JSON.stringify(
    {
      version: 'https://jsonfeed.org/version/1.1',
      title: feed.title,
      home_page_url: feed.site_url,
      feed_url: feed.self_url,
      ...(feed.description ? { description: feed.description } : {}),
      language: feed.lang,
      items: feed.entries.map((e) => ({
        id: `urn:uuid:${e.id}`,
        url: e.url,
        title: e.title,
        content_text: e.summary,
        summary: e.summary,
        date_published: new Date(e.validated_at).toISOString(),
      })),
    },
    null,
    2,
  )
}
