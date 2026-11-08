import { describe, expect, it } from 'vitest'
import { DEFAULT_KINDS, isModuleEnabled, kindLabel, parseTopicConfig } from './topic-config'

describe('parseTopicConfig', () => {
  it('fills defaults from an empty config', () => {
    const config = parseTopicConfig({})
    expect(config.output_langs).toEqual(['fr', 'en'])
    expect(config.ai.draft_mode).toBe('on_validate')
    expect(config.schedule.slots).toEqual(['09:00', '16:00'])
    expect(config.schedule.digest.weekday).toBe(5)
  })

  it('gives the default kinds, or the unused categories of older configs', () => {
    expect(parseTopicConfig({}).kinds).toEqual(DEFAULT_KINDS)
    const legacy = parseTopicConfig({
      categories: [{ key: 'news', label_fr: 'Actu', label_en: 'News' }],
    })
    expect(legacy.kinds).toEqual([
      { key: 'news', label_fr: 'Actu', label_en: 'News', description: '' },
    ])
    expect(kindLabel(legacy, 'news', 'fr')).toBe('Actu')
    expect(kindLabel(legacy, 'gone', 'fr')).toBe('gone')
  })

  it('rejects duplicate kind keys', () => {
    const kind = { key: 'news', label_fr: 'A', label_en: 'A' }
    expect(() => parseTopicConfig({ kinds: [kind, kind] })).toThrow()
  })

  it('keeps existing topics as curation boards, with an empty product', () => {
    const config = parseTopicConfig({})
    expect(config.modules).toEqual({ curation: true, engagement: false })
    expect(isModuleEnabled(config, 'curation')).toBe(true)
    expect(isModuleEnabled(config, 'engagement')).toBe(false)
    expect(config.product.name).toBe('')
    expect(config.product.url).toBe('')
  })

  it('accepts a product profile and rejects a product address that is not a web address', () => {
    const config = parseTopicConfig({
      modules: { curation: false, engagement: true },
      product: { name: 'CheckFox', url: 'https://checkfox.eu', disclosure: 'I made CheckFox.' },
    })
    expect(config.product.name).toBe('CheckFox')
    expect(config.product.messages).toBe('')
    expect(isModuleEnabled(config, 'curation')).toBe(false)
    expect(() => parseTopicConfig({ product: { url: 'ftp://checkfox.eu' } })).toThrow()
  })

  it('rejects invalid time slots', () => {
    expect(() => parseTopicConfig({ schedule: { slots: ['25:00'] } })).toThrow()
  })
})
