import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchText } from './fetch-text'
import { resolveFeed } from './feeds'

function serve(pages: Record<string, string>) {
  vi.stubGlobal('fetch', async (input: URL | string) => {
    const url = input.toString()
    const body = pages[url]
    if (body === undefined) return new Response('not found', { status: 404 })
    const res = new Response(body, { status: 200 })
    Object.defineProperty(res, 'url', { value: url })
    return res
  })
}

const RSS =
  '<?xml version="1.0"?><rss version="2.0"><channel><title>Blog a11y</title></channel></rss>'

afterEach(() => vi.unstubAllGlobals())

describe('resolveFeed', () => {
  it('accepts a feed URL directly', async () => {
    serve({ 'https://example.org/feed.xml': RSS })
    expect(await resolveFeed('https://example.org/feed.xml')).toEqual({
      kind: 'feed',
      url: 'https://example.org/feed.xml',
      title: 'Blog a11y',
      format: 'rss',
    })
  })

  it('discovers and verifies the feed declared by a page', async () => {
    serve({
      'https://example.org/news/':
        '<head><link rel="alternate" type="application/rss+xml" href="/rss.xml"></head>',
      'https://example.org/rss.xml': RSS,
    })
    expect(await resolveFeed('https://example.org/news/')).toMatchObject({
      kind: 'feed',
      url: 'https://example.org/rss.xml',
    })
  })

  it('asks to choose when a page declares several feeds', async () => {
    serve({
      'https://example.org/': `<link rel="alternate" type="application/rss+xml" href="/fr.xml" title="FR">
        <link rel="alternate" type="application/atom+xml" href="/en.xml" title="EN">`,
    })
    const result = await resolveFeed('https://example.org/')
    expect(result.kind).toBe('choose')
  })

  it('reports pages without a feed and unreachable URLs', async () => {
    serve({ 'https://example.org/': '<html><head><title>x</title></head></html>' })
    expect(await resolveFeed('https://example.org/')).toEqual({
      kind: 'none',
      reason: 'No feed declared on this page',
    })
    expect(await resolveFeed('https://example.org/missing')).toEqual({
      kind: 'none',
      reason: 'HTTP 404',
    })
  })
})

describe('fetchText', () => {
  it('refuses private addresses', async () => {
    await expect(fetchText('http://127.0.0.1:8787/api/health')).rejects.toThrow('Private address')
    await expect(fetchText('http://192.168.1.1/')).rejects.toThrow('Private address')
    await expect(fetchText('http://localhost/')).rejects.toThrow('Private address')
  })
})
