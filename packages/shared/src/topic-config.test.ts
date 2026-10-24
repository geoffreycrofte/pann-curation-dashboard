import { describe, expect, it } from 'vitest'
import { parseTopicConfig } from './topic-config'

describe('parseTopicConfig', () => {
  it('fills defaults from an empty config', () => {
    const config = parseTopicConfig({})
    expect(config.output_langs).toEqual(['fr', 'en'])
    expect(config.ai.draft_mode).toBe('on_validate')
    expect(config.schedule.slots).toEqual(['09:00', '16:00'])
    expect(config.schedule.digest.weekday).toBe(5)
  })

  it('rejects invalid time slots', () => {
    expect(() => parseTopicConfig({ schedule: { slots: ['25:00'] } })).toThrow()
  })
})
