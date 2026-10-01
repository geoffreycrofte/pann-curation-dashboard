import { fetchText, FetchTextError } from '../../lib/fetch-text'
import { parseFeed } from '../feed-parser'
import { SourceError, type Adapter } from '../types'

/** Newest entries kept per run, after the date filter. */
const MAX_ENTRIES = 50

export const rssAdapter: Adapter = async (source, { since }) => {
  const url = source.config.url
  if (typeof url !== 'string') throw new SourceError('Missing feed URL')

  let page
  try {
    page = await fetchText(url, { timeoutMs: 15_000, maxBytes: 5 * 1024 * 1024 })
  } catch (err) {
    throw new SourceError(err instanceof FetchTextError ? err.message : 'Unreachable')
  }

  let feed
  try {
    feed = parseFeed(page.text, page.url)
  } catch {
    throw new SourceError('Not an RSS or Atom document anymore')
  }

  const items = feed.entries
    // Undated entries are kept: deduplication prevents them from coming back.
    .filter((e) => !e.published_at || new Date(e.published_at) >= since)
    .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
    .slice(0, MAX_ENTRIES)
    .map((e) => ({
      url: e.url,
      title: e.title,
      content: e.content,
      published_at: e.published_at,
      source_lang: feed.lang,
      kind: source.default_kind,
    }))

  return { items }
}
