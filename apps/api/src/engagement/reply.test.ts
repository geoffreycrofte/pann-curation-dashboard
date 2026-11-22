import { parseTopicConfig } from '@glimr/shared'
import { describe, expect, it } from 'vitest'
import { replyLimit, replySystemPrompt, replyUserMessage } from './reply'

const topic = (product: object, ai: object = {}) => ({
  name_en: 'Contrast checker',
  config: parseTopicConfig({ product, ai }),
})

describe('reply prompt', () => {
  it('gives the product, the disclosure and the platform limit', () => {
    const system = replySystemPrompt(
      topic({ name: 'Contrastly', disclosure: 'I work on Contrastly.' }),
      { platform: 'bluesky', lang: 'fr' },
    )
    expect(system).toContain('Name: Contrastly')
    expect(system).toContain('Disclosure sentence: I work on Contrastly.')
    expect(system).toContain('using the disclosure sentence above')
    expect(system).toContain('At most 300 characters')
    expect(system).toContain('Write in French')
  })

  it('adds the style rules of the person, and nothing of its own when there are none', () => {
    const withRules = replySystemPrompt(topic({}, { style_rules: 'Tutoiement.' }), {
      platform: 'hackernews',
      lang: null,
    })
    expect(withRules).toContain('# Style rules (set by the team)\nTutoiement.')
    expect(withRules).toContain(`At most ${replyLimit('hackernews')} characters`)
    const without = replySystemPrompt(topic({}), { platform: 'hackernews', lang: 'en' })
    expect(without).not.toContain('Style rules')
    expect(without).not.toContain('disclosure sentence above')
  })

  it('passes the conversation and the angle found at triage', () => {
    const message = replyUserMessage({
      title: 'Ask HN: contrast in CI?',
      canonical_url: 'https://news.ycombinator.com/item?id=1',
      fetched_content: 'How do you check contrast in CI?',
      meta: { platform: 'hackernews', author: 'alice' },
      angle: 'Share a CI recipe.',
    })
    expect(message).toContain('Platform: hackernews')
    expect(message).toContain('Author: alice')
    expect(message).toContain('How a reply could help (from the review): Share a CI recipe.')
    expect(message).toContain('How do you check contrast in CI?')
  })
})
