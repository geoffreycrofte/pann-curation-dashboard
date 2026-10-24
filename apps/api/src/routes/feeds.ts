import {
  FEED_KEY_PATTERN,
  renderJsonFeed,
  renderRss,
  type FeedEntry,
  type FeedInput,
  type Lang,
} from '@pann/shared'
import { createClient } from '@supabase/supabase-js'
import { Hono } from 'hono'
import type { Env } from '../env'

interface FeedRow {
  topic: {
    name_fr: string
    name_en: string
    feed: Partial<Record<`${'title' | 'description'}_${Lang}` | 'site_url', string>>
  }
  items: FeedEntry[]
}

/** Feed readers poll often: answers are cached for 15 minutes. */
const MAX_AGE = 900

const notFound = () =>
  new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })

/**
 * Public feeds, without sign-in. Anonymous requests: the publishable key only, and a
 * database function that returns nothing but what the feed shows (topic_feed).
 */
export const feeds = new Hono<{ Bindings: Env }>().get('/feeds/:key/:file', async (c) => {
  const { key, file } = c.req.param()
  const match = /^(fr|en)\.(xml|json)$/.exec(file)
  if (!FEED_KEY_PATTERN.test(key) || !match) return notFound()
  const lang = match[1] as Lang
  const format = match[2] as 'xml' | 'json'

  const cache = typeof caches !== 'undefined' ? caches.default : undefined
  const cached = await cache?.match(c.req.raw)
  if (cached) return cached

  const db = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.rpc('topic_feed', { p_key: key, p_lang: lang })
  if (error) throw error
  if (!data) return notFound()
  const row = data as FeedRow

  const origin = new URL(c.req.url).origin
  const settings = row.topic.feed
  const input: FeedInput = {
    lang,
    title: settings[`title_${lang}`] || row.topic[`name_${lang}`],
    description: settings[`description_${lang}`] ?? '',
    self_url: `${origin}/feeds/${key}/${file}`,
    site_url: settings.site_url || origin,
    entries: row.items,
  }
  const response = new Response(format === 'xml' ? renderRss(input) : renderJsonFeed(input), {
    headers: {
      'Content-Type':
        format === 'xml'
          ? 'application/rss+xml; charset=utf-8'
          : 'application/feed+json; charset=utf-8',
      'Cache-Control': `public, max-age=${MAX_AGE}`,
      // Any site may read the feed (a curation page fetching the JSON, say).
      'Access-Control-Allow-Origin': '*',
      'X-Robots-Tag': 'noindex',
      'Content-Language': lang,
    },
  })
  if (cache) c.executionCtx.waitUntil(cache.put(c.req.raw, response.clone()))
  return response
})
