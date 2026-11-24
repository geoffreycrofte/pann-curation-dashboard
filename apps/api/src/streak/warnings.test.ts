import { describe, expect, it } from 'vitest'
import { streakEmail } from './warnings'

describe('streak warning', () => {
  const email = streakEmail(
    {
      topic_id: 't1',
      name_fr: 'Accessibilité <b>',
      name_en: 'Accessibility',
      weeks: 3,
      week_start: '2026-11-23T00:00:00Z',
      emails: ['owner@example.org'],
    },
    'Glimr <support@example.org>',
    'https://glimr.example',
  )

  it('goes to the owners once a week, with a link to the calendar', () => {
    expect(email.to).toEqual(['owner@example.org'])
    expect(email.idempotencyKey).toBe('glimr-streak-t1-2026-11-23')
    expect(email.text).toContain('https://glimr.example/t/t1/calendar')
    expect(email.text).toContain('3 semaines')
  })

  it('escapes the topic name in HTML', () => {
    expect(email.html).not.toContain('<b>')
    expect(email.html).toContain('&lt;b&gt;')
  })
})
