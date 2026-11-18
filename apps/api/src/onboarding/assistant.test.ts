import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  MAX_QUESTIONS,
  onboardingMessages,
  onboardingSystemPrompt,
  runOnboarding,
  type AssistantModel,
  type OnboardingContext,
  type OnboardingMessage,
  type Proposal,
} from './assistant'

const context: OnboardingContext = {
  name: 'Example',
  tools: ['curation'],
  channels: ['linkedin'],
  listen: [],
  ui_lang: 'fr',
}

const emptyProposal: Proposal = {
  name_en: null,
  description: 'A tool',
  audience: null,
  messages: null,
  claims_to_avoid: null,
  output_langs: ['fr'],
  relevance_criteria: null,
  engagement_criteria: null,
  style_rules: null,
  post_rules: null,
  posts_per_day: null,
  slots: null,
}

interface FakeState {
  session: {
    id: string
    workspace_id: string
    context: OnboardingContext
    messages: OnboardingMessage[]
    status: string
  }
  budget: { workspace_onboarding: number; month_total: number; credit: number; cap: number }
  keys: { provider: string; secret: string }[]
  updates: Record<string, unknown>[]
  usage: Record<string, unknown>[]
}

/** Just the calls runOnboarding makes, on in-memory rows. */
function fakeDb(state: FakeState): SupabaseClient {
  const ok = <T>(data: T) => Promise.resolve({ data, error: null })
  return {
    from(table: string) {
      if (table === 'usage_log')
        return { insert: (row: Record<string, unknown>) => (state.usage.push(row), ok(null)) }
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => ok(state.session) }) }),
        update: (fields: Record<string, unknown>) => ({
          eq: () => (state.updates.push(fields), ok(null)),
        }),
      }
    },
    rpc(name: string) {
      if (name === 'onboarding_budget') return { single: () => ok(state.budget) }
      return ok(state.keys)
    },
  } as unknown as SupabaseClient
}

function state(overrides: Partial<FakeState['session']> = {}): FakeState {
  return {
    session: {
      id: 's1',
      workspace_id: 'w1',
      context,
      messages: [],
      status: 'pending',
      ...overrides,
    },
    budget: { workspace_onboarding: 0, month_total: 0, credit: 0.5, cap: 20 },
    keys: [{ provider: 'anthropic', secret: 'sk-test' }],
    updates: [],
    usage: [],
  }
}

const usage = { input_tokens: 1000, output_tokens: 200 } as never

const answering =
  (done = false): AssistantModel =>
  async () => ({
    ok: true,
    model: 'claude-opus-5-5',
    usage,
    output: {
      reply: 'Pour qui ?',
      quick_replies: ['a', 'b', 'c', 'd', 'e'],
      done,
      proposal: emptyProposal,
    },
  })

describe('onboarding prompt', () => {
  it('asks only for the settings of the chosen tools', () => {
    const curation = onboardingSystemPrompt(context)
    expect(curation).toContain('worth keeping')
    expect(curation).not.toContain('reply helps')
    const engagement = onboardingSystemPrompt({ ...context, tools: ['engagement'] })
    expect(engagement).toContain('reply helps')
    expect(engagement).not.toContain('posts per day')
  })

  it('writes in the interface language', () => {
    expect(onboardingSystemPrompt(context)).toContain('Write in French')
    expect(onboardingSystemPrompt({ ...context, ui_lang: 'en' })).toContain('Write in English')
  })

  it('adjusts an existing topic: its settings in the context, changes only', () => {
    const adjust = { ...context, current: { description: 'A tool', style_rules: '' } }
    const prompt = onboardingSystemPrompt(adjust)
    expect(prompt).toContain('adjust the settings of an existing topic')
    expect(prompt).toContain('Never copy an unchanged value')
    const [first] = onboardingMessages(adjust, [], null)
    expect(first!.content).toContain('- description: A tool')
    expect(first!.content).toContain('- style_rules: (empty)')
  })

  it('does not read the website when adjusting', async () => {
    const s = state({
      context: { ...context, url: 'https://example.org', current: { description: 'A tool' } },
    })
    let intro = ''
    const model: AssistantModel = async (call) => {
      intro = String(call.messages[0]!.content)
      return answering()(call)
    }
    await runOnboarding(fakeDb(s), 's1', model)
    expect(intro).not.toContain('Website text')
  })

  it('gives the context first, then the exchange', () => {
    const messages = onboardingMessages(
      { ...context, url: 'https://example.org' },
      [
        { role: 'assistant', text: 'Q1' },
        { role: 'user', text: 'R1' },
      ],
      'Site text',
    )
    expect(messages).toHaveLength(3)
    expect(messages[0]!.role).toBe('user')
    expect(messages[0]!.content).toContain('Website: https://example.org')
    expect(messages[0]!.content).toContain('Site text')
    expect(messages[2]).toEqual({ role: 'user', content: 'R1' })
  })
})

describe('runOnboarding', () => {
  it('answers, logs the cost on Pann, and waits for the next answer', async () => {
    const s = state()
    expect(await runOnboarding(fakeDb(s), 's1', answering())).toBe('answered')
    expect(s.usage[0]).toMatchObject({
      billed_to: 'platform',
      operation: 'onboarding',
      topic_id: null,
      workspace_id: 'w1',
    })
    expect(Number(s.usage[0]!.cost_usd)).toBeCloseTo((1000 * 4 + 200 * 20) / 1e6)
    const update = s.updates[0]!
    expect(update.status).toBe('idle')
    expect((update.messages as OnboardingMessage[])[0]!.quick_replies).toHaveLength(4)
    expect(update.proposal).toEqual(emptyProposal)
  })

  it('stops after the last question even if the model goes on', async () => {
    const history: OnboardingMessage[] = []
    for (let i = 0; i < MAX_QUESTIONS - 1; i++)
      history.push({ role: 'assistant', text: `Q${i}` }, { role: 'user', text: `R${i}` })
    const s = state({ messages: history })
    expect(await runOnboarding(fakeDb(s), 's1', answering())).toBe('done')
    expect(s.updates[0]!.status).toBe('done')
  })

  it('does not call the model past the onboarding credit', async () => {
    const s = state()
    s.budget.workspace_onboarding = 0.5
    let called = false
    const model: AssistantModel = async () => ((called = true), { ok: false, error: 'x' })
    expect(await runOnboarding(fakeDb(s), 's1', model)).toBe('credit_exhausted')
    expect(called).toBe(false)
    expect(s.updates[0]).toMatchObject({ status: 'done', error: 'onboarding_credit_exhausted' })
  })

  it('does not call the model past Pann monthly cap', async () => {
    const s = state()
    s.budget.month_total = 20
    expect(await runOnboarding(fakeDb(s), 's1', answering())).toBe('credit_exhausted')
  })

  it('fails without Pann key', async () => {
    const s = state()
    s.keys = []
    expect(await runOnboarding(fakeDb(s), 's1', answering())).toBe('no_key')
    expect(s.updates[0]).toMatchObject({ status: 'failed', error: 'onboarding_unavailable' })
  })

  it('records the error code of a failed call', async () => {
    const s = state()
    const model: AssistantModel = async () => ({ ok: false, error: 'rate_limited:anthropic' })
    expect(await runOnboarding(fakeDb(s), 's1', model)).toBe('rate_limited:anthropic')
    expect(s.updates[0]).toMatchObject({ status: 'failed', error: 'rate_limited:anthropic' })
    expect(s.usage).toHaveLength(0)
  })

  it('skips a session that is not waiting', async () => {
    const s = state({ status: 'idle' })
    expect(await runOnboarding(fakeDb(s), 's1', answering())).toBe('skipped')
    expect(s.updates).toHaveLength(0)
  })
})
