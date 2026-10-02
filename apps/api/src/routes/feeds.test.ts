import { afterEach, describe, expect, it, vi } from 'vitest'
import { feeds } from './feeds'

const env = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
} as never
const KEY = 'abcdefghijklmnopqrstuvwxyz012345'

const row = {
  topic: { name_fr: 'Accessibilité', name_en: 'Accessibility', feed: { title_fr: 'Veille a11y' } },
  items: [
    {
      id: '6f1c0a9e-0000-4000-8000-000000000001',
      url: 'https://e.org/a',
      title: 'WCAG 2.2',
      source_lang: 'en',
      summary: 'Un résumé.',
      validated_at: '2026-10-09T06:00:00Z',
    },
  ],
}

function database(answer: unknown) {
  const calls: { url: string; body: unknown; headers: Headers }[] = []
  vi.stubGlobal('fetch', async (input: Request | string, init?: RequestInit) => {
    const request = new Request(input, init)
    calls.push({
      url: request.url,
      body: await request.json().catch(() => null),
      headers: request.headers,
    })
    return new Response(JSON.stringify(answer), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('public feeds', () => {
  it('serves RSS with the anonymous key and the topic_feed function', async () => {
    const calls = database(row)
    const res = await feeds.request(`https://pann.example/feeds/${KEY}/fr.xml`, {}, env)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/rss+xml; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=900')
    const xml = await res.text()
    expect(xml).toContain('<title>Veille a11y</title>')
    expect(xml).toContain(`<atom:link href="https://pann.example/feeds/${KEY}/fr.xml"`)
    expect(calls[0]!.url).toBe('http://127.0.0.1:54321/rest/v1/rpc/topic_feed')
    expect(calls[0]!.body).toEqual({ p_key: KEY, p_lang: 'fr' })
    expect(calls[0]!.headers.get('apikey')).toBe('sb_publishable_x')
  })

  it('serves JSON Feed, with the topic name when no title is set', async () => {
    database(row)
    const res = await feeds.request(`https://pann.example/feeds/${KEY}/en.json`, {}, env)
    const json = (await res.json()) as { title: string; items: unknown[] }
    expect(json.title).toBe('Accessibility')
    expect(json.items).toHaveLength(1)
  })

  it('answers 404 for an unknown key, without reading the database for a malformed one', async () => {
    const calls = database(null)
    expect((await feeds.request(`https://pann.example/feeds/${KEY}/fr.xml`, {}, env)).status).toBe(
      404,
    )
    expect((await feeds.request('https://pann.example/feeds/short/fr.xml', {}, env)).status).toBe(
      404,
    )
    expect((await feeds.request(`https://pann.example/feeds/${KEY}/de.xml`, {}, env)).status).toBe(
      404,
    )
    expect(calls).toHaveLength(1)
  })
})
