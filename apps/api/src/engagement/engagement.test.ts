import { parseTopicConfig } from '@pann/shared'
import { describe, expect, it } from 'vitest'
import type { EngagementModel } from './model'
import { engagementSystemPrompt, engagementUserMessage } from './prompt'
import {
  decideEngagement,
  triageConversations,
  type EngagementDecisionRecord,
  type EngagementStore,
  type PendingConversation,
} from './triage'

const config = parseTopicConfig({
  modules: { engagement: true },
  output_langs: ['fr', 'en'],
  product: {
    name: 'CheckFox',
    description: 'Accessibility audit tool.',
    claims_to_avoid: 'Guaranteed compliance.',
  },
  engagement: { criteria: 'People auditing websites.', threshold: 60 },
})

function conversation(overrides: Partial<PendingConversation> = {}): PendingConversation {
  return {
    item_id: 'i',
    topic_id: 't',
    workspace_id: 'w',
    topic_name_en: 'CheckFox',
    topic_config: config,
    source_lang: null,
    triage_attempts: 0,
    title: 'Ask HN: how do you audit accessibility?',
    canonical_url: 'https://news.ycombinator.com/item?id=1',
    published_at: '2026-11-08T10:00:00Z',
    fetched_content: 'We only run axe.',
    meta: { platform: 'hackernews', points: 12, comments: 3 },
    ...overrides,
  }
}

describe('engagement prompt', () => {
  it('is built from the product profile and the criteria of the topic', () => {
    const system = engagementSystemPrompt({ name_en: 'CheckFox', config })
    expect(system).toContain('Name: CheckFox')
    expect(system).toContain('What it is: Accessibility audit tool.')
    expect(system).toContain('Never claim: Guaranteed compliance.')
    expect(system).toContain('People auditing websites.')
    expect(system).toContain('Nothing is ever posted automatically')
    expect(system).toContain('Write the reason and the angle in French.')
  })

  it('gives the platform, the thread and the counts of the conversation', () => {
    const user = engagementUserMessage(
      conversation({ meta: { platform: 'hackernews', thread_title: 'Show HN: X', points: 2 } }),
    )
    expect(user).toContain('Platform: hackernews')
    expect(user).toContain('Thread: Show HN: X')
    expect(user).toContain('Points or likes: 2')
    expect(user).toContain('We only run axe.')
  })
})

describe('decideEngagement', () => {
  const output = {
    decision: 'reply',
    angle: ' Suggest manual checks. ',
    risk: 'low',
    reason: ' Ok ',
    language: 'EN',
  } as const

  it('keeps a good opportunity and archives a low one or a skip', () => {
    expect(decideEngagement({ ...output, opportunity: 82.4 }, config)).toEqual({
      opportunity: 82,
      decision: 'reply',
      angle: 'Suggest manual checks.',
      risk: 'low',
      reason: 'Ok',
      language: 'en',
      archived: false,
    })
    expect(decideEngagement({ ...output, opportunity: 40 }, config).archived).toBe(true)
    const skip = decideEngagement({ ...output, decision: 'skip', opportunity: 90 }, config)
    expect(skip.archived).toBe(true)
    expect(skip.angle).toBeNull()
  })
})

describe('triageConversations', () => {
  it('judges conversations of topics with engagement on, and leaves the others waiting', async () => {
    const saved: [string, EngagementDecisionRecord][] = []
    const store: EngagementStore = {
      pending: async () => [
        conversation({ item_id: 'on' }),
        conversation({ item_id: 'off', topic_config: parseTopicConfig({}) }),
      ],
      anthropicKey: async () => 'key',
      markCredentialInvalid: async () => {},
      saveDecision: async (item, decision) => void saved.push([item.item_id, decision]),
      saveFailure: async () => {},
      logUsage: async () => {},
    }
    const model: EngagementModel = async () => ({
      ok: true,
      output: {
        language: 'en',
        opportunity: 75,
        decision: 'reply',
        angle: 'Help',
        risk: 'low',
        reason: 'r',
      },
      usage: { input_tokens: 10, output_tokens: 5 },
    })
    const report = await triageConversations({ store, model })
    expect(report).toEqual({ triaged: 1, archived: 0, failed: 0, skipped_no_key: 0 })
    expect(saved.map(([id]) => id)).toEqual(['on'])
  })
})
