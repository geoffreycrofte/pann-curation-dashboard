import { describe, expect, it } from 'vitest'
import { lastDigestTime, nextDigestTime, renderDigest } from './digest'
import { parseTopicConfig } from './topic-config'

const schedule = parseTopicConfig({}).schedule // Friday 08:00, Europe/Luxembourg

describe('digest time', () => {
  it('finds the last and next Friday 08:00 in Luxembourg', () => {
    const now = new Date('2026-10-07T12:00:00Z') // Wednesday
    expect(lastDigestTime(schedule, now).toISOString()).toBe('2026-10-02T06:00:00.000Z')
    expect(nextDigestTime(schedule, now).toISOString()).toBe('2026-10-09T06:00:00.000Z')
  })

  it('counts the time of today when it has passed', () => {
    const friday = new Date('2026-10-09T06:30:00Z')
    expect(lastDigestTime(schedule, friday).toISOString()).toBe('2026-10-09T06:00:00.000Z')
    const before = new Date('2026-10-09T05:30:00Z')
    expect(lastDigestTime(schedule, before).toISOString()).toBe('2026-10-02T06:00:00.000Z')
  })
})

describe('renderDigest', () => {
  const input = {
    lang: 'fr' as const,
    title: 'Lede',
    intro: 'Bonjour,\n\nVoici la semaine.',
    items: [
      {
        title: 'WCAG <3> & co',
        url: 'https://www.w3.org/x',
        summary: 'Un "résumé".',
        source_lang: 'en',
      },
    ],
    date: new Date('2026-10-09T06:00:00Z'),
    timezone: 'Europe/Luxembourg',
  }

  it('builds the subject from the name and the date', () => {
    expect(renderDigest(input).subject).toBe('Lede, 9 octobre 2026')
  })

  it('escapes the content and marks the language of foreign titles', () => {
    const { html } = renderDigest(input)
    expect(html).toContain('<html lang="fr">')
    expect(html).toContain('lang="en"')
    expect(html).toContain('WCAG &lt;3&gt; &amp; co')
    expect(html).toContain('Un &quot;résumé&quot;.')
    expect(html).toContain(
      '<p style="margin:16px 0 0;font-size:16px;line-height:1.55;">Voici la semaine.</p>',
    )
    expect(html).toContain('w3.org')
  })

  it('uses the Brevo links, except in the preview', () => {
    expect(renderDigest(input).html).toContain('href="{{ unsubscribe }}"')
    expect(renderDigest(input).html).toContain('href="{{ mirror }}"')
    expect(renderDigest({ ...input, preview: true }).html).not.toContain('{{')
  })
})
