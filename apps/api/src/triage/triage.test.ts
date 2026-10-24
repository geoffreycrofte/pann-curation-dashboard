import { parseTopicConfig } from '@pann/shared'
import { describe, expect, it } from 'vitest'
import type { TriageModel } from './model'
import { triageSystemPrompt, triageUserMessage } from './prompt'
import { decide, triage, type PendingTriage, type TriageDecision, type TriageStore } from './triage'

const config = parseTopicConfig({
  ai: { relevance_threshold: 50, relevance_criteria: 'Digital accessibility' },
})

function item(id: string, workspace = 'w1'): PendingTriage {
  return {
    item_id: id,
    topic_id: 't1',
    workspace_id: workspace,
    topic_name_en: 'Digital accessibility',
    topic_config: config,
    item_kind: null,
    source_lang: null,
    triage_attempts: 0,
    title: `Item ${id}`,
    canonical_url: `https://example.org/${id}`,
    published_at: '2026-09-30T10:00:00Z',
    fetched_content: 'x'.repeat(10_000),
  }
}

function memoryStore(items: PendingTriage[], keys: Record<string, string>) {
  const decisions: Record<string, TriageDecision> = {}
  const failures: Record<string, string> = {}
  const invalid: string[] = []
  const usage: unknown[] = []
  const store: TriageStore = {
    pending: async ({ limit }) => items.slice(0, limit),
    anthropicKey: async (w) => keys[w],
    markCredentialInvalid: async (w) => void invalid.push(w),
    saveDecision: async (i, d) => void (decisions[i.item_id] = d),
    saveFailure: async (i, e) => void (failures[i.item_id] = e),
    logUsage: async (_i, u) => void usage.push(u),
  }
  return { store, decisions, failures, invalid, usage }
}

const usage = { input_tokens: 1500, output_tokens: 60 }

describe('triage', () => {
  it('scores items, archives those under the threshold and logs the real cost', async () => {
    const {
      store,
      decisions,
      usage: logged,
    } = memoryStore([item('a'), item('b')], { w1: 'sk-ant' })
    const model: TriageModel = async ({ user }) => ({
      ok: true,
      usage,
      output: {
        language: 'en',
        kind: 'legal',
        relevance: user.includes('/a') ? 87 : 12,
        commercial: false,
        reason: 'Reason',
      },
    })
    const report = await triage({ store, model })
    expect(report).toEqual({ triaged: 2, archived: 1, failed: 0, skipped_no_key: 0 })
    expect(decisions.a?.archived).toBe(false)
    expect(decisions.b?.archived).toBe(true)
    expect(logged[0]).toMatchObject({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      operation: 'triage',
      cost_usd: 0.0018,
    })
  })

  it('leaves items waiting when the workspace has no Anthropic key', async () => {
    const { store, decisions } = memoryStore([item('a'), item('b'), item('c', 'w2')], {
      w2: 'sk-ant',
    })
    let calls = 0
    const model: TriageModel = async () => {
      calls++
      return {
        ok: true,
        usage,
        output: { language: 'en', kind: 'news', relevance: 70, commercial: false, reason: 'r' },
      }
    }
    const report = await triage({ store, model })
    expect(report.skipped_no_key).toBe(1)
    expect(calls).toBe(1)
    expect(Object.keys(decisions)).toEqual(['c'])
  })

  it('flags a rejected key once and stops calling for that workspace', async () => {
    const { store, invalid, failures } = memoryStore([item('a'), item('b')], { w1: 'bad' })
    let calls = 0
    const model: TriageModel = async () => {
      calls++
      return { ok: false, error: 'invalid_credential' }
    }
    await triage({ store, model })
    expect(calls).toBe(1)
    expect(invalid).toEqual(['w1'])
    expect(failures).toEqual({})
  })

  it('counts an attempt on refusals or invalid output, but not on rate limits', async () => {
    const { store, failures } = memoryStore([item('a'), item('b')], { w1: 'k' })
    const model: TriageModel = async ({ user }) =>
      user.includes('/a')
        ? { ok: false, error: 'refusal', usage }
        : { ok: false, error: 'rate_limited' }
    await triage({ store, model })
    expect(failures).toEqual({ a: 'refusal' })
  })
})

describe('decide', () => {
  it('clamps the score and falls back on a known kind', () => {
    expect(
      decide(
        { relevance: 140.4, commercial: true, reason: ' ok ', kind: 'weird', language: 'FR' },
        config,
      ),
    ).toEqual({
      relevance: 100,
      commercial: true,
      reason: 'ok',
      kind: 'news',
      language: 'fr',
      archived: false,
    })
  })
})

describe('prompt', () => {
  it('builds the system prompt from the topic config only', () => {
    const system = triageSystemPrompt({ name_en: 'Digital accessibility', config })
    expect(system).toContain('Relevance criteria: Digital accessibility')
    expect(system).toContain('Write the reason in French.')
    expect(system).not.toContain('em dash')
  })

  it('truncates the content sent for triage', () => {
    const message = triageUserMessage(item('a'))
    expect(message).toContain('URL: https://example.org/a')
    expect(message.length).toBeLessThan(6200)
  })
})
