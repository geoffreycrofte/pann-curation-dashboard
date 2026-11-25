import { describe, expect, it } from 'vitest'
import { NETWORK_POST_DEFAULTS } from './drafting'
import { networkPostRule, networkRulesForPrompt, parseTopicConfig } from './topic-config'

describe('network post rules', () => {
  it('gives every network its default when the topic changed nothing', () => {
    const config = parseTopicConfig({})
    expect(networkPostRule(config, 'facebook')).toEqual(NETWORK_POST_DEFAULTS.facebook)
  })

  it('keeps a topic setting, within what the network takes', () => {
    const config = parseTopicConfig({
      ai: { network_rules: { bluesky: { min_chars: 400, max_chars: 900, max_hashtags: 1 } } },
    })
    expect(networkPostRule(config, 'bluesky')).toEqual({
      min_chars: 300,
      max_chars: 300,
      max_hashtags: 1,
    })
  })

  it('reads an older config without the field', () => {
    const config = parseTopicConfig({})
    const old = { ...config, ai: { ...config.ai, network_rules: undefined } }
    // @ts-expect-error an older stored config, read without parsing
    expect(networkPostRule(old, 'linkedin')).toEqual(NETWORK_POST_DEFAULTS.linkedin)
  })

  it('says the rules as the prompts read them', () => {
    const config = parseTopicConfig({})
    expect(networkRulesForPrompt(config, ['linkedin', 'discord', 'bluesky'])).toBe(
      [
        '- linkedin: 800 to 1300 characters, at most 3 hashtags',
        '- discord: 200 to 800 characters, no hashtags',
        '- bluesky: up to 280 characters, at most 2 hashtags',
      ].join('\n'),
    )
  })
})
