import { parseTopicConfig } from '@pann/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CollectSource } from '../types'
import { domainFilters, exaAdapter } from './exa'
import { blueskyAdapter, postUrl } from './bluesky'
import { githubAdapter } from './github'
import { hackerNewsAdapter } from './hackernews'
import { rssAdapter } from './rss'

const since = new Date('2026-09-01T00:00:00Z')
const base: CollectSource = {
  id: 's',
  topic_id: 't',
  workspace_id: 'w',
  module: 'curation',
  type: 'rss',
  label: 'x',
  config: {},
  active: true,
  default_kind: null,
  interval_hours: null,
  last_run_at: null,
  run_requested_at: null,
  topic_config: parseTopicConfig({}),
}

type Handler = (url: string, init?: RequestInit) => Response
function stubFetch(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.stubGlobal('fetch', async (input: URL | string, init?: RequestInit) => {
    const url = input.toString()
    calls.push({ url, init })
    const res = handler(url, init)
    Object.defineProperty(res, 'url', { value: url })
    return res
  })
  return calls
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

afterEach(() => vi.unstubAllGlobals())

describe('rssAdapter', () => {
  it('keeps recent and undated entries, with the source kind and feed language', async () => {
    stubFetch(
      () =>
        new Response(`<rss><channel><language>fr</language>
          <item><title>Old</title><link>https://e.org/old</link><pubDate>Mon, 03 Aug 2026 10:00:00 GMT</pubDate></item>
          <item><title>New</title><link>https://e.org/new</link><pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate></item>
          <item><title>Undated</title><link>https://e.org/undated</link></item>
        </channel></rss>`),
    )
    const { items } = await rssAdapter(
      { ...base, config: { url: 'https://e.org/rss' }, default_kind: 'legal' },
      { since, secrets: {} },
    )
    expect(items.map((i) => [i.title, i.kind, i.source_lang])).toEqual([
      ['New', 'legal', 'fr'],
      ['Undated', 'legal', 'fr'],
    ])
  })

  it('reports HTTP errors as source errors', async () => {
    stubFetch(() => new Response('', { status: 503 }))
    await expect(
      rssAdapter({ ...base, config: { url: 'https://e.org/rss' } }, { since, secrets: {} }),
    ).rejects.toThrow('http:503')
  })
})

describe('exaAdapter', () => {
  it('requires a key', async () => {
    await expect(
      exaAdapter({ ...base, type: 'exa', config: { query: 'q' } }, { since, secrets: {} }),
    ).rejects.toThrow('missing_credential:exa')
  })

  it('sends the documented request and logs the real cost', async () => {
    const calls = stubFetch(() =>
      json({
        results: [
          {
            url: 'https://n.org/a',
            title: 'EAA news',
            publishedDate: '2026-09-30T00:00:00.000Z',
            text: 'Body',
          },
        ],
        costDollars: { total: 0.012 },
      }),
    )
    const result = await exaAdapter(
      { ...base, type: 'exa', default_kind: 'legal', config: { query: 'EAA', num_results: 5 } },
      { since, secrets: { exa: 'k' } },
    )
    const call = calls[0]!
    expect(call.url).toBe('https://api.exa.ai/search')
    expect((call.init?.headers as Record<string, string>)['x-api-key']).toBe('k')
    expect(JSON.parse(call.init?.body as string)).toMatchObject({
      query: 'EAA',
      numResults: 5,
      startPublishedDate: '2026-09-01T00:00:00.000Z',
      contents: { text: { maxCharacters: 6000 } },
    })
    expect(result.items).toEqual([
      {
        url: 'https://n.org/a',
        title: 'EAA news',
        content: 'Body',
        published_at: '2026-09-30T00:00:00.000Z',
        kind: 'legal',
      },
    ])
    expect(result.usage?.[0]?.cost_usd).toBe(0.012)
  })
})

describe('exaAdapter errors', () => {
  it('reports a rejected key as an invalid credential', async () => {
    stubFetch(() => json({ error: 'unauthorized' }, 401))
    await expect(
      exaAdapter(
        { ...base, type: 'exa', config: { query: 'q' } },
        { since, secrets: { exa: 'bad' } },
      ),
    ).rejects.toThrow('invalid_credential:exa')
  })
})

describe('githubAdapter', () => {
  it('reports the rate limit so the board can suggest a token', async () => {
    stubFetch(() => json({ message: 'API rate limit exceeded' }, 403))
    await expect(
      githubAdapter(
        { ...base, type: 'github', config: { query: 'topic:a11y' } },
        { since, secrets: {} },
      ),
    ).rejects.toThrow('rate_limited:github')
  })

  it('searches popular recently pushed repos and uses the latest release as signature', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('/search/repositories')) {
        return json({
          items: [
            {
              full_name: 'o/tool',
              html_url: 'https://github.com/o/tool',
              description: 'A11y linter',
              topics: ['a11y'],
              stargazers_count: 120,
              pushed_at: '2026-09-20T00:00:00Z',
            },
            {
              full_name: 'o/lib',
              html_url: 'https://github.com/o/lib',
              description: null,
              topics: [],
              stargazers_count: 30,
              pushed_at: '2026-09-21T00:00:00Z',
            },
          ],
        })
      }
      if (url.endsWith('/o/tool/releases/latest'))
        return json({ tag_name: 'v2.1.0', published_at: '2026-09-19T00:00:00Z' })
      return json({ message: 'Not Found' }, 404)
    })
    const { items } = await githubAdapter(
      { ...base, type: 'github', config: { query: 'topic:a11y' }, default_kind: 'tool' },
      { since, secrets: { github: 't' } },
    )
    const search = new URL(calls[0]!.url)
    expect(search.searchParams.get('q')).toBe('topic:a11y pushed:>=2026-09-01 stars:>=20')
    expect(search.searchParams.get('sort')).toBe('stars')
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe('Bearer t')
    expect(items.map((i) => [i.title, i.change_signature, i.published_at, i.kind])).toEqual([
      ['o/tool: A11y linter', 'v2.1.0', '2026-09-19T00:00:00Z', 'tool'],
      ['o/lib', null, '2026-09-21T00:00:00Z', 'tool'],
    ])
  })
})

describe('domainFilters', () => {
  it('adds the topic exclusions to the source ones', () => {
    expect(domainFilters(undefined, ['a.org'], ['b.org', 'a.org'])).toEqual({
      excludeDomains: ['a.org', 'b.org'],
    })
    expect(domainFilters(undefined, undefined, [])).toEqual({})
  })

  it('removes excluded sites from an include list and sends no exclusion with it', () => {
    expect(domainFilters(['w3.org', 'blog.b.org'], undefined, ['b.org'])).toEqual({
      includeDomains: ['w3.org'],
    })
  })
})

describe('hackerNewsAdapter', () => {
  it('searches recent stories and comments and links to the discussion on Hacker News', async () => {
    const calls = stubFetch(() =>
      json({
        hits: [
          {
            objectID: '11',
            _tags: ['story', 'ask_hn'],
            author: 'ana',
            created_at: '2026-09-02T10:00:00Z',
            title: 'Ask HN: How do you audit accessibility?',
            story_text: 'We use axe &amp; manual checks.',
            points: 12,
            num_comments: 4,
          },
          {
            objectID: '12',
            _tags: ['comment'],
            author: 'bo',
            created_at: '2026-09-02T11:00:00Z',
            comment_text: '<p>Try a <i>screen reader</i> first.</p>',
            story_title: 'Show HN: A WCAG checker',
          },
          { objectID: '13', _tags: ['story'], title: 'Low', points: 1 },
        ],
      }),
    )
    const result = await hackerNewsAdapter(
      {
        ...base,
        module: 'engagement',
        type: 'hackernews',
        config: { query: 'wcag', min_points: 5 },
      },
      { since, secrets: {} },
    )
    const url = new URL(calls[0]!.url)
    expect(url.origin + url.pathname).toBe('https://hn.algolia.com/api/v1/search_by_date')
    expect(url.searchParams.get('tags')).toBe('(story,comment)')
    expect(url.searchParams.get('numericFilters')).toBe('created_at_i>1788220800')
    expect(result.items.map((i) => [i.url, i.title, i.content])).toEqual([
      [
        'https://news.ycombinator.com/item?id=11',
        'Ask HN: How do you audit accessibility?',
        'We use axe & manual checks.',
      ],
      [
        'https://news.ycombinator.com/item?id=12',
        'Show HN: A WCAG checker',
        'Try a screen reader first.',
      ],
    ])
    expect(result.items[0]?.meta).toEqual({
      platform: 'hackernews',
      author: 'ana',
      points: 12,
      comments: 4,
    })
    expect(result.items[1]?.meta).toMatchObject({ thread_title: 'Show HN: A WCAG checker' })
  })
})

describe('blueskyAdapter', () => {
  it('searches the latest posts since the window and links to them on bsky.app', async () => {
    const calls = stubFetch(() =>
      json({
        posts: [
          {
            uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz',
            author: { handle: 'ana.bsky.social' },
            record: {
              text: 'Anyone has a good accessibility audit checklist?',
              createdAt: '2026-09-03T08:00:00Z',
              langs: ['en'],
            },
            replyCount: 2,
            likeCount: 5,
          },
        ],
      }),
    )
    const result = await blueskyAdapter(
      { ...base, module: 'engagement', type: 'bluesky', config: { query: 'audit', lang: 'en' } },
      { since, secrets: {} },
    )
    const url = new URL(calls[0]!.url)
    expect(url.origin + url.pathname).toBe('https://api.bsky.app/xrpc/app.bsky.feed.searchPosts')
    expect(url.searchParams.get('since')).toBe('2026-09-01T00:00:00.000Z')
    expect(url.searchParams.get('lang')).toBe('en')
    expect(result.items).toEqual([
      {
        url: 'https://bsky.app/profile/ana.bsky.social/post/3kxyz',
        title: 'Anyone has a good accessibility audit checklist?',
        content: 'Anyone has a good accessibility audit checklist?',
        published_at: '2026-09-03T08:00:00Z',
        source_lang: 'en',
        kind: null,
        meta: { platform: 'bluesky', author: 'ana.bsky.social', points: 5, comments: 2 },
      },
    ])
  })

  it('gives no link for an URI that is not a post', () => {
    expect(postUrl('at://did:plc:abc/app.bsky.feed.like/1', 'a')).toBeNull()
  })
})
