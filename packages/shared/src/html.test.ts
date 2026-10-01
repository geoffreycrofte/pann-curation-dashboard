import { describe, expect, it } from 'vitest'
import { detectFeedFormat, discoverFeeds, extractFeedTitle, extractPageTitle } from './html'

describe('detectFeedFormat', () => {
  it('recognises RSS, Atom and RDF after an XML declaration and comments', () => {
    expect(detectFeedFormat('﻿<?xml version="1.0"?>\n<!-- c --><rss version="2.0">')).toBe('rss')
    expect(
      detectFeedFormat(
        '<?xml version="1.0"?><?xml-stylesheet href="x"?><feed xmlns="http://www.w3.org/2005/Atom">',
      ),
    ).toBe('atom')
    expect(detectFeedFormat('<rdf:RDF xmlns:rdf="…">')).toBe('rdf')
  })

  it('rejects HTML', () => {
    expect(detectFeedFormat('<!DOCTYPE html><html><head>')).toBeNull()
  })
})

describe('discoverFeeds', () => {
  const html = `<html><head>
    <link rel="stylesheet" href="/a.css">
    <link rel="alternate" type="application/rss+xml" title="Actualit&eacute;s &amp; news" href="/fr/rss.xml">
    <link type='application/atom+xml' href='https://example.org/atom' rel='alternate'>
    <link rel="alternate" hreflang="en" href="/en/">
  </head></html>`

  it('finds declared feeds and resolves relative URLs', () => {
    expect(discoverFeeds(html, 'https://example.org/fr/news/')).toEqual([
      {
        url: 'https://example.org/fr/rss.xml',
        title: 'Actualités & news',
        type: 'application/rss+xml',
      },
      { url: 'https://example.org/atom', title: null, type: 'application/atom+xml' },
    ])
  })
})

describe('titles', () => {
  it('prefers og:title for pages', () => {
    const html = '<title>Site | Article</title><meta property="og:title" content="L&#8217;article">'
    expect(extractPageTitle(html)).toBe('L’article')
  })

  it('falls back to <title> and handles CDATA in feeds', () => {
    expect(extractPageTitle('<title>\n  Hello  world </title>')).toBe('Hello world')
    expect(extractFeedTitle('<rss><channel><title><![CDATA[News & co]]></title>')).toBe('News & co')
  })
})
