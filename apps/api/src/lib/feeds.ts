import {
  detectFeedFormat,
  discoverFeeds,
  errorCode,
  extractFeedTitle,
  type FeedFormat,
} from '@pann/shared'
import { fetchText, FetchTextError } from './fetch-text'

export type FeedResolution =
  | { kind: 'feed'; url: string; title: string | null; format: FeedFormat }
  | { kind: 'choose'; candidates: { url: string; title: string | null }[] }
  | { kind: 'none'; /** Error code */ reason: string }

/**
 * Accepts either a feed URL or a page URL. For a page, uses feed autodiscovery
 * (<link rel="alternate">) and verifies the feed it points to.
 */
export async function resolveFeed(input: string): Promise<FeedResolution> {
  let page
  try {
    page = await fetchText(input)
  } catch (err) {
    return {
      kind: 'none',
      reason: err instanceof FetchTextError ? err.message : errorCode('unreachable'),
    }
  }

  const format = detectFeedFormat(page.text)
  if (format) return { kind: 'feed', url: page.url, title: extractFeedTitle(page.text), format }

  const discovered = discoverFeeds(page.text, page.url).filter(
    (f) => f.type !== 'application/feed+json',
  )
  if (discovered.length === 0) return { kind: 'none', reason: errorCode('no_feed') }
  if (discovered.length > 1) {
    return { kind: 'choose', candidates: discovered.map(({ url, title }) => ({ url, title })) }
  }

  const only = discovered[0]!
  try {
    const feed = await fetchText(only.url)
    const feedFormat = detectFeedFormat(feed.text)
    if (!feedFormat) return { kind: 'none', reason: errorCode('declared_feed_invalid') }
    return {
      kind: 'feed',
      url: feed.url,
      title: extractFeedTitle(feed.text) ?? only.title,
      format: feedFormat,
    }
  } catch (err) {
    return {
      kind: 'none',
      reason: err instanceof FetchTextError ? err.message : errorCode('unreachable'),
    }
  }
}
