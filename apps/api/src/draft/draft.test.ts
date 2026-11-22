import { parseTopicConfig } from '@glimr/shared'
import { describe, expect, it } from 'vitest'
import { draft, toDraftWrite, type DraftStore, type DraftWrite, type PendingDraft } from './draft'
import type { DraftModel } from './model'
import type { DraftOutput } from './prompt'
import { draftSystemPrompt } from './prompt'

const config = parseTopicConfig({
  ai: { editorial_rules: 'Always name the country.', post_rules: 'No hashtags.' },
})

const output: DraftOutput = {
  insufficient_content: false,
  summaries: { fr: 'Résumé.', en: 'Summary.' },
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
    draft_scope: 'all',
    existing_posts: [],
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
  it('only adds the rule sections the topic defines, after the built-in ones', () => {
    const system = draftSystemPrompt({ name_en: 'Digital accessibility', config })
    expect(system).toContain('# Topic rules\nAlways name the country.')
    expect(system).toContain('# Post rules\nNo hashtags.')
    expect(system).not.toContain('# Style rules')
    expect(system.trim().endsWith('No hashtags.')).toBe(true)
  })

  it('has no style or topic-specific rule built in', () => {
    const system = draftSystemPrompt({ name_en: 'Anything', config: parseTopicConfig({}) })
    for (const hardCoded of ['RGAA', 'em dash', 'handicap', 'CamelCase', 'emoji']) {
      expect(system).not.toContain(hardCoded)
    }
  })

  it('maps the model output to storage rows', () => {
    const write = toDraftWrite(
      output,
      'claude-sonnet-5-5',
      ['linkedin', 'bluesky', 'mastodon'],
      ['fr', 'en'],
    )
    expect(write.posts[0]).toEqual({ channel: 'linkedin', lang: 'fr', body: 'LI fr' })
    expect(write.posts).toHaveLength(6)
  })

  it('asks for X, Facebook or Discord posts only when the topic publishes there', async () => {
    const asked: string[][] = []
    const model: DraftModel = async (call) => {
      asked.push([...call.channels])
      return { ok: true, output, usage, model: 'claude-sonnet-5-5' }
    }
    const withDiscord = parseTopicConfig({
      channels: [{ channel: 'discord', account_id: 'd1', langs: ['fr'] }],
    })
    const { store } = memoryStore([item('a'), item('b', { topic_config: withDiscord })])
    await draft({ store, model })
    expect(asked).toEqual([
      ['linkedin', 'bluesky', 'mastodon'],
      ['linkedin', 'bluesky', 'mastodon', 'discord'],
    ])
  })

  it('drafts only the missing posts and leaves the rest untouched', async () => {
    const withDiscord = parseTopicConfig({
      ...config,
      channels: [
        { channel: 'linkedin', account_id: 'li', langs: ['fr', 'en'] },
        { channel: 'discord', account_id: 'd1', langs: ['en'] },
      ],
    })
    const existing_posts = (['linkedin', 'bluesky', 'mastodon'] as const).flatMap((channel) =>
      (['fr', 'en'] as const).map((lang) => ({ channel, lang })),
    )
    const { store, saved } = memoryStore([
      item('a', { topic_config: withDiscord, draft_scope: 'missing', existing_posts }),
    ])
    const asked: unknown[] = []
    const model: DraftModel = async (input) => {
      asked.push(input.channels)
      return {
        ok: true,
        output: { ...output, posts: { discord: { fr: 'DC fr', en: 'DC en' } } },
        usage,
        model: 'claude-sonnet-5-5',
      }
    }
    await draft({ store, model })
    expect(asked).toEqual([['discord']])
    expect(saved.a?.posts_only).toBe(true)
    expect(saved.a?.posts).toEqual([{ channel: 'discord', lang: 'en', body: 'DC en' }])
  })

  it('calls no model when no post is missing any more', async () => {
    const { store, saved } = memoryStore([item('a', { draft_scope: 'missing' })])
    let called = false
    const model: DraftModel = async () => {
      called = true
      return { ok: true, output, usage, model: 'claude-sonnet-5-5' }
    }
    expect(await draft({ store, model })).toEqual({ drafted: 1, failed: 0, skipped: 0 })
    expect(called).toBe(false)
    expect(saved.a).toMatchObject({ posts_only: true, posts: [] })
  })

  it('writes in the languages of the topic, whatever they are', async () => {
    const german = parseTopicConfig({ output_langs: ['de', 'pt-BR'] })
    const asked: unknown[] = []
    const model: DraftModel = async (call) => {
      asked.push([call.langs, call.system])
      return {
        ok: true,
        output: {
          ...output,
          summaries: { de: 'Zusammenfassung.', 'pt-BR': 'Resumo.' },
          posts: { linkedin: { de: 'LI de', 'pt-BR': 'LI pt' } },
        },
        usage,
        model: 'claude-sonnet-5-5',
      }
    }
    const { store, saved } = memoryStore([item('a', { topic_config: german })])
    await draft({ store, model })
    const [langs, system] = asked[0] as [string[], string]
    expect(langs).toEqual(['de', 'pt-BR'])
    expect(system).toContain('German (de), Brazilian Portuguese (pt-BR)')
    expect(saved.a?.summaries).toEqual([
      { lang: 'de', summary: 'Zusammenfassung.' },
      { lang: 'pt-BR', summary: 'Resumo.' },
    ])
    // Posts the model left out (Bluesky, Mastodon) are not saved empty.
    expect(saved.a?.posts).toEqual([
      { channel: 'linkedin', lang: 'de', body: 'LI de' },
      { channel: 'linkedin', lang: 'pt-BR', body: 'LI pt' },
    ])
  })
})
