import { hackerNewsSourceConfigSchema } from '@pann/shared'
import { z } from 'zod'
import { USER_AGENT } from '../../lib/fetch-text'
import { htmlToText } from '../feed-parser'
import { SourceError, type Adapter } from '../types'

/** https://hn.algolia.com/api (checked 2026-11-08): no key, newest first. */
const SEARCH_URL = 'https://hn.algolia.com/api/v1/search_by_date'
const ITEM_URL = 'https://news.ycombinator.com/item?id='

const TAGS = { stories: 'story', comments: 'comment', all: '(story,comment)' } as const

const responseSchema = z.object({
  hits: z.array(
    z.object({
      objectID: z.string(),
      _tags: z.array(z.string()).default([]),
      author: z.string().nullish(),
      created_at: z.string().nullish(),
      title: z.string().nullish(),
      url: z.string().nullish(),
      story_text: z.string().nullish(),
      comment_text: z.string().nullish(),
      story_title: z.string().nullish(),
      points: z.number().nullish(),
      num_comments: z.number().nullish(),
    }),
  ),
})

/**
 * Stories and comments matching the query. The item is the discussion on Hacker
 * News (where a reply would be posted), not the page a story links to.
 */
export const hackerNewsAdapter: Adapter = async (source, { since }) => {
  const config = hackerNewsSourceConfigSchema.safeParse(source.config)
  if (!config.success) throw new SourceError('invalid_config')
  const { query, scope, min_points, max_results } = config.data

  const url = new URL(SEARCH_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('tags', TAGS[scope])
  url.searchParams.set('hitsPerPage', String(max_results))
  url.searchParams.set('numericFilters', `created_at_i>${Math.floor(since.getTime() / 1000)}`)

  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new SourceError('http', res.status)
  const body = responseSchema.safeParse(await res.json())
  if (!body.success) throw new SourceError('provider_response', 'hackernews')

  return {
    items: body.data.hits.flatMap((hit) => {
      const isComment = hit._tags.includes('comment')
      // Comments have no public score: the floor applies to stories only.
      if (!isComment && min_points && (hit.points ?? 0) < min_points) return []
      const text = htmlToText(hit.comment_text ?? hit.story_text ?? '', 6000)
      const thread = hit.story_title ?? undefined
      const title = (isComment ? thread : hit.title)?.trim() || text.slice(0, 120) || hit.objectID
      return [
        {
          url: `${ITEM_URL}${hit.objectID}`,
          title,
          // A link story without text: what it links to is its subject.
          content: text || (hit.url ? `Link: ${hit.url}` : null),
          published_at: hit.created_at ?? null,
          kind: source.default_kind,
          meta: {
            platform: 'hackernews' as const,
            ...(hit.author ? { author: hit.author } : {}),
            ...(isComment && thread ? { thread_title: thread } : {}),
            ...(hit.points != null ? { points: hit.points } : {}),
            ...(hit.num_comments != null ? { comments: hit.num_comments } : {}),
          },
        },
      ]
    }),
  }
}
