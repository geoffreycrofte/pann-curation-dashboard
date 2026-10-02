import { describe, expect, it } from 'vitest'
import { FEED_KEY_PATTERN, feedPath, newFeedKey, renderJsonFeed, renderRss } from './feed'

const feed = {
  lang: 'fr' as const,
  title: 'Veille accessibilité',
  description: 'Les éléments retenus & résumés',
  self_url: 'https://pann.example/feeds/k/fr.xml',
  site_url: 'https://checkfox.eu/veille',
  entries: [
    {
      id: '6f1c0a9e-0000-4000-8000-000000000001',
      url: 'https://e.org/a?x=1&y=2',
      title: 'WCAG <2.2>',
      source_lang: 'en',
      summary: 'Un résumé.',
      validated_at: '2026-10-09T06:00:00Z',
    },
  ],
}

describe('feed keys', () => {
  it('are random and URL-safe', () => {
    const a = newFeedKey()
    expect(a).toMatch(FEED_KEY_PATTERN)
    expect(a).toHaveLength(32)
    expect(newFeedKey()).not.toBe(a)
    expect(feedPath(a, 'en', 'json')).toBe(`/feeds/${a}/en.json`)
  })
})

describe('renderRss', () => {
  it('writes a valid RSS 2.0 channel, escaped', () => {
    const xml = renderRss(feed)
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')
    expect(xml).toContain('<atom:link href="https://pann.example/feeds/k/fr.xml" rel="self"')
    expect(xml).toContain('<language>fr</language>')
    expect(xml).toContain('<title>WCAG &lt;2.2&gt;</title>')
    expect(xml).toContain('<link>https://e.org/a?x=1&amp;y=2</link>')
    expect(xml).toContain('<pubDate>Fri, 09 Oct 2026 06:00:00 GMT</pubDate>')
    expect(xml).toContain('<description>Les éléments retenus &amp; résumés</description>')
  })
})

describe('renderJsonFeed', () => {
  it('follows JSON Feed 1.1', () => {
    const json = JSON.parse(renderJsonFeed(feed))
    expect(json.version).toBe('https://jsonfeed.org/version/1.1')
    expect(json.feed_url).toBe(feed.self_url)
    expect(json.items[0]).toEqual({
      id: 'urn:uuid:6f1c0a9e-0000-4000-8000-000000000001',
      url: 'https://e.org/a?x=1&y=2',
      title: 'WCAG <2.2>',
      content_text: 'Un résumé.',
      summary: 'Un résumé.',
      date_published: '2026-10-09T06:00:00.000Z',
    })
  })
})
