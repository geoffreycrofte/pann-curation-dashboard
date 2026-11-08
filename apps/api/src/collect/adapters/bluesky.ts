import { blueskySourceConfigSchema } from '@pann/shared'
import { z } from 'zod'
import { USER_AGENT } from '../../lib/fetch-text'
import { SourceError, type Adapter } from '../types'

/**
 * Post search without an account (checked 2026-11-08): api.bsky.app answers,
 * public.api.bsky.app refuses searches with a 403.
 */
const SEARCH_URL = 'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts'

const responseSchema = z.object({
  posts: z.array(
    z.object({
      uri: z.string(),
      author: z.object({ handle: z.string(), displayName: z.string().nullish() }),
      record: z.object({
        text: z.string().default(''),
        createdAt: z.string().nullish(),
        langs: z.array(z.string()).nullish(),
        reply: z.unknown().nullish(),
      }),
      replyCount: z.number().nullish(),
      likeCount: z.number().nullish(),
    }),
  ),
})

/** at://did/app.bsky.feed.post/rkey → https://bsky.app/profile/handle/post/rkey */
export function postUrl(uri: string, handle: string): string | null {
  const rkey = uri.match(/\/app\.bsky\.feed\.post\/([^/]+)$/)?.[1]
  return rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : null
}

export const blueskyAdapter: Adapter = async (source, { since }) => {
  const config = blueskySourceConfigSchema.safeParse(source.config)
  if (!config.success) throw new SourceError('invalid_config')
  const { query, lang, max_results } = config.data

  const url = new URL(SEARCH_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('sort', 'latest')
  url.searchParams.set('limit', String(max_results))
  url.searchParams.set('since', since.toISOString())
  if (lang) url.searchParams.set('lang', lang)

  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new SourceError('http', res.status)
  const body = responseSchema.safeParse(await res.json())
  if (!body.success) throw new SourceError('provider_response', 'bluesky')

  return {
    items: body.data.posts.flatMap((post) => {
      const link = postUrl(post.uri, post.author.handle)
      const text = post.record.text.trim()
      if (!link || !text) return []
      return [
        {
          url: link,
          title: text.length > 120 ? `${text.slice(0, 117).trimEnd()}…` : text,
          content: text,
          published_at: post.record.createdAt ?? null,
          source_lang: post.record.langs?.[0]?.slice(0, 8) ?? null,
          kind: source.default_kind,
          meta: {
            platform: 'bluesky' as const,
            author: post.author.handle,
            ...(post.likeCount != null ? { points: post.likeCount } : {}),
            ...(post.replyCount != null ? { comments: post.replyCount } : {}),
          },
        },
      ]
    }),
  }
}
