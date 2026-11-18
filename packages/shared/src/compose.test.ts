import { describe, expect, it } from 'vitest'
import { composeSchedule, missingAlt } from './compose'
import { bodyLimit, composePost, publishedLength } from './diffusion'
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

  it('publishes a composed post without a link as its text only', () => {
    expect(composePost('Bonjour', '')).toBe('Bonjour')
    expect(composePost('Bonjour', '', 'Signé')).toBe('Bonjour\n\nSigné')
    expect(composePost('Bonjour', 'https://a.example')).toBe('Bonjour\n\nhttps://a.example')
    expect(publishedLength('bluesky', 'Bonjour', '')).toBe(7)
    expect(bodyLimit('bluesky', '')).toBe(300)
  })
})
