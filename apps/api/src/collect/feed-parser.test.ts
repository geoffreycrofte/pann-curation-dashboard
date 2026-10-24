import { describe, expect, it } from 'vitest'
import { htmlToText, parseFeed } from './feed-parser'

describe('parseFeed', () => {
  it('reads RSS 2.0 with CDATA, entities, content:encoded and a permalink guid', () => {
    const feed = parseFeed(`<?xml version="1.0"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel><title>Blog &amp; co</title><language>fr-FR</language>
          <item>
            <title><![CDATA[L'accessibilité &eacute;volue]]></title>
            <link>https://example.org/a</link>
            <pubDate>Tue, 29 Sep 2026 08:00:00 +0200</pubDate>
            <description>short</description>
            <content:encoded><![CDATA[<p>Long <strong>body</strong></p><p>Second</p>]]></content:encoded>
          </item>
          <item><title>Guid only</title><guid isPermaLink="true">https://example.org/b</guid></item>
          <item><title>No link</title><guid isPermaLink="false">abc-123</guid></item>
        </channel>
      </rss>`)
    expect(feed.title).toBe('Blog & co')
    expect(feed.lang).toBe('fr-FR')
    expect(feed.entries).toEqual([
      {
        url: 'https://example.org/a',
        title: "L'accessibilité évolue",
        content: 'Long body\nSecond',
        published_at: '2026-09-29T06:00:00.000Z',
      },
      { url: 'https://example.org/b', title: 'Guid only', content: null, published_at: null },
    ])
  })

  it('reads Atom with alternate links and relative URLs', () => {
    const feed = parseFeed(
      `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en"><title type="text">WAI</title>
        <entry><title>News</title>
          <link rel="self" href="https://example.org/self"/>
          <link rel="alternate" type="text/html" href="/news/1"/>
          <updated>2026-09-30T10:00:00Z</updated>
          <summary type="html">&lt;p&gt;Hello&lt;/p&gt;</summary>
        </entry>
      </feed>`,
      'https://example.org/feed.xml',
    )
    expect(feed).toEqual({
      title: 'WAI',
      lang: 'en',
      entries: [
        {
          url: 'https://example.org/news/1',
          title: 'News',
          content: 'Hello',
          published_at: '2026-09-30T10:00:00.000Z',
        },
      ],
    })
  })

  it('reads RSS 1.0 (RDF)', () => {
    const feed =
      parseFeed(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel><title>Legal</title></channel>
      <item><title>Text</title><link>https://example.eu/t</link><dc:date>2026-09-01</dc:date></item>
    </rdf:RDF>`)
    expect(feed.entries).toEqual([
      {
        url: 'https://example.eu/t',
        title: 'Text',
        content: null,
        published_at: '2026-09-01T00:00:00.000Z',
      },
    ])
  })

  it('rejects other documents', () => {
    expect(() => parseFeed('<html><body/></html>')).toThrow()
  })
})

describe('htmlToText', () => {
  it('drops scripts and tags, keeps paragraphs, truncates', () => {
    expect(htmlToText('<script>x()</script><p>A&nbsp;b</p><p>c</p>')).toBe('A b\nc')
    expect(htmlToText('abcdef', 3)).toBe('abc')
  })
})
