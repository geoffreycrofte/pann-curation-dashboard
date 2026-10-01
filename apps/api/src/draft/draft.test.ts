import { parseTopicConfig } from '@pann/shared'
import { describe, expect, it } from 'vitest'
import { draft, toDraftWrite, type DraftStore, type DraftWrite, type PendingDraft } from './draft'
import type { DraftModel } from './model'
import type { DraftOutput } from './prompt'
import { draftSystemPrompt } from './prompt'

const config = parseTopicConfig({ ai: { editorial_rules: 'Always name the country.' } })

const output: DraftOutput = {
  insufficient_content: false,
  summary_fr: 'Résumé.',
  summary_en: 'Summary.',
  key_excerpt: 'A short quote',
  source_type: 'regulatory',
  posts: {
    linkedin: { fr: 'LI fr', en: 'LI en' },
    bluesky: { fr: 'BS fr', en: 'BS en' },
    mastodon: { fr: 'MA fr', en: 'MA en' },
  },
}
const usage = {
  input_tokens: 4000,
  output_tokens: 1200,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 1500,
}

function item(id: string, overrides: Partial<PendingDraft> = {}): PendingDraft {
  return {
    item_id: id,
    topic_id: 't1',
    workspace_id: 'w1',
    topic_name_en: 'Digital accessibility',
    topic_config: config,
    monthly_budget_usd: 10,
    draft_attempts: 0,
    title: 'Title',
    canonical_url: `https://e.org/${id}`,
    published_at: null,
    source_lang: 'fr',
    fetched_content: 'x'.repeat(2000),
    ...overrides,
  }
}

function memoryStore(
  items: PendingDraft[],
  opts: { key?: string; spent?: number; page?: string } = {},
) {
  const saved: Record<string, DraftWrite> = {}
  const failures: Record<string, [string, boolean]> = {}
  const logged: unknown[] = []
  const fetched: string[] = []
  const store: DraftStore = {
    pending: async ({ limit }) => items.slice(0, limit),
    anthropicKey: async () => ('key' in opts ? opts.key : 'sk-ant'),
    markCredentialInvalid: async () => {},
    monthCostUsd: async () => opts.spent ?? 0,
    fetchContent: async (i) => {
      fetched.push(i.item_id)
      return opts.page ?? null
    },
    saveDraft: async (i, d) => void (saved[i.item_id] = d),
    saveFailure: async (i, e, final) => void (failures[i.item_id] = [e, final]),
    logUsage: async (_i, u) => void logged.push(u),
  }
  return { store, saved, failures, logged, fetched }
}

describe('draft', () => {
  it('writes summaries, excerpt and 6 post drafts, and logs the cost of the model that answered', async () => {
    const { store, saved, logged } = memoryStore([item('a')])
    const model: DraftModel = async () => ({ ok: true, output, usage, model: 'claude-sonnet-5-5' })
    expect(await draft({ store, model })).toEqual({ drafted: 1, failed: 0, skipped: 0 })
    expect(saved.a?.summaries).toEqual([
      { lang: 'fr', summary: 'Résumé.' },
      { lang: 'en', summary: 'Summary.' },
    ])
    expect(saved.a?.posts).toHaveLength(6)
    expect(saved.a?.source_nature).toBe('regulatory')
    expect(logged[0]).toMatchObject({ operation: 'draft', model: 'claude-sonnet-5-5' })
    expect((logged[0] as { cost_usd: number }).cost_usd).toBeCloseTo(
      (4000 * 2 + 1500 * 2.5 + 1200 * 10) / 1e6,
      10,
    )
  })

  it('stops drafting once the monthly budget is spent, without calling the model', async () => {
    const { store, failures } = memoryStore([item('a')], { spent: 10.01 })
    let calls = 0
    const model: DraftModel = async () => {
      calls++
      return { ok: true, output, usage, model: 'claude-sonnet-5-5' }
    }
    await draft({ store, model })
    expect(calls).toBe(0)
    expect(failures.a).toEqual(['budget_exceeded', true])
  })

  it('needs an Anthropic key', async () => {
    const { store, failures } = memoryStore([item('a')], { key: undefined })
    await draft({ store, model: async () => ({ ok: false, error: 'provider_error' }) })
    expect(failures.a).toEqual(['missing_credential:anthropic', true])
  })

  it('fetches the page when the stored content is too thin, and accepts "insufficient content"', async () => {
    const { store, fetched, failures } = memoryStore([item('a', { fetched_content: 'short' })], {
      page: 'page text',
    })
    let sent = ''
    const model: DraftModel = async ({ user }) => {
      sent = user
      return {
        ok: true,
        output: { ...output, insufficient_content: true },
        usage,
        model: 'claude-sonnet-5-5',
      }
    }
    await draft({ store, model })
    expect(fetched).toEqual(['a'])
    expect(sent).toContain('page text')
    expect(failures.a).toEqual(['insufficient_content', true])
  })

  it('retries provider errors up to 3 attempts', async () => {
    const { store, failures } = memoryStore([item('a'), item('b', { draft_attempts: 2 })])
    await draft({ store, model: async () => ({ ok: false, error: 'provider_error' }) })
    expect(failures).toEqual({ a: ['provider_error', false], b: ['provider_error', true] })
  })
})

describe('draft prompt', () => {
  it('carries the editorial rules and the topic rules last', () => {
    const system = draftSystemPrompt({ name_en: 'Digital accessibility', config })
    expect(system).toContain('never use an em dash')
    expect(system).toContain('RGAA 4.1 and RGAA 5 are different texts')
    expect(system.trim().endsWith('Always name the country.')).toBe(true)
  })

  it('maps the model output to storage rows', () => {
    expect(toDraftWrite(output, 'claude-sonnet-5-5').posts[0]).toEqual({
      channel: 'linkedin',
      lang: 'fr',
      body: 'LI fr',
    })
  })
})
