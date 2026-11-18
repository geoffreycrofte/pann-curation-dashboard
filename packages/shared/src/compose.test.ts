import { describe, expect, it } from 'vitest'
import { composeSchedule, missingAlt } from './compose'
import { parseTopicConfig } from './topic-config'

describe('compose', () => {
  it('has its own slots, in the topic time zone', () => {
    const config = parseTopicConfig({
      schedule: { timezone: 'Europe/Paris', slots: ['09:00'] },
      compose: { slots: ['18:00'], posts_per_day: 1 },
    })
    expect(config.modules.compose).toBe(false)
    expect(config.compose.mode).toBe('notes')
    expect(composeSchedule(config)).toMatchObject({
      timezone: 'Europe/Paris',
      slots: ['18:00'],
      posts_per_day: 1,
    })
  })

  it('lists the languages where an image has no text alternative', () => {
    const media = [{ alt: { fr: 'Un chat', en: ' ' } }, { alt: { fr: 'Un chien', en: 'A dog' } }]
    expect(missingAlt(media, ['fr', 'en'])).toEqual(['en'])
    expect(missingAlt([], ['fr'])).toEqual([])
  })
})
