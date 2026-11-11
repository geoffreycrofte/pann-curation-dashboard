import { describe, expect, it } from 'vitest'
import { digestWindowStart, lastDigestTime, nextDigestTime, renderDigest } from './digest'
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

describe('digestWindowStart', () => {
  const now = new Date('2026-11-11T12:00:00Z')

  it('starts where the last issue sent started', () => {
    const last = new Date('2026-11-06T07:00:00Z')
    expect(digestWindowStart(last, parseTopicConfig({}), now)).toEqual(last)
  })

  it('starts the first issue on the day set, at midnight in the topic time zone', () => {
    const config = parseTopicConfig({ newsletter: { first_issue_from: '2026-10-01' } })
    expect(digestWindowStart(null, config, now).toISOString()).toBe('2026-09-30T22:00:00.000Z')
  })

  it('looks 7 days back otherwise', () => {
    expect(digestWindowStart(null, parseTopicConfig({}), now).toISOString()).toBe(
      '2026-11-04T12:00:00.000Z',
    )
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

  it('uses the SendFox unsubscribe link, without a web version link', () => {
    const { html } = renderDigest({ ...input, provider: 'sendfox' })
    expect(html).toContain('href="{{unsubscribe_url}}"')
    expect(html).not.toContain('{{ mirror }}')
    expect(html).toContain('<body')
  })

  it('applies the look set by the user: logo, accent, footer', () => {
    const { html } = renderDigest({
      ...input,
      logoUrl: 'https://example.org/logo.png',
      accentColor: '#2e4672',
      footer: 'Lede, 1 rue <Exemple>',
    })
    expect(html).toContain('<img src="https://example.org/logo.png" alt=""')
    expect(html).toContain('border-top:6px solid #2e4672')
    expect(html).toContain('Lede, 1 rue &lt;Exemple&gt;')
    // A logo that is not https, or a color that is not one, is ignored.
    const unsafe = renderDigest({ ...input, logoUrl: 'javascript:x', accentColor: 'red;x' }).html
    expect(unsafe).not.toContain('<img')
    expect(unsafe).toContain('border-top:6px solid #ffc72c')
  })

  it('groups the items under their kind, unknown kinds last', () => {
    const item = input.items[0]!
    const { html } = renderDigest({
      ...input,
      items: [
        { ...item, title: 'Loi', kind: 'legal' },
        { ...item, title: 'Sans type', kind: null },
        { ...item, title: 'Actu', kind: 'news' },
      ],
      groups: [
        { key: 'news', label: 'Actualités' },
        { key: 'legal', label: 'Légal' },
        { key: 'tool', label: 'Outils' },
      ],
    })
    const order = [
      '>Actualités</h2>',
      '>Actu</a></h3>',
      '>Légal</h2>',
      '>Loi</a></h3>',
      '>Autres</h2>',
    ]
    const positions = order.map((text) => html.indexOf(text))
    expect(positions.every((p) => p > 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(html).not.toContain('Outils')
  })
})
