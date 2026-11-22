import { parseTopicConfig, type DraftChannel, type Lang } from '@glimr/shared'
import { describe, expect, it, vi } from 'vitest'
import type { UsageEntry } from '../collect/types'
import {
  compositionChannels,
  runComposeDraft,
  runComposeResearch,
  runDescribeMedia,
  type ComposeDeps,
  type CompositionRow,
  type MediaRow,
} from './jobs'
import type { ComposeModel, StructuredCall } from './model'
import { composeSystemPrompt, composeUserMessage } from './prompt'

const config = parseTopicConfig({
  output_langs: ['fr', 'en'],
  target_channels: ['linkedin', 'bluesky'],
  ai: { style_rules: 'Phrases courtes.' },
})

function composition(overrides: Partial<CompositionRow> = {}): CompositionRow {
  return {
    id: 'c1',
    topic_id: 't1',
    workspace_id: 'w1',
    subject: 'Notre nouvelle version',
    mode: 'notes',
    notes: 'Sortie de la version 2. Plus rapide.',
    link: '',
    sources: [],
    channels: [],
    draft_status: 'pending',
    research_status: 'idle',
    topic: { name_en: 'Example', config, monthly_budget_usd: 10 },
    ...overrides,
  }
}

function fakeStore(row: CompositionRow, media?: MediaRow) {
  const state = {
    row: { ...row },
    media: media ? { ...media } : undefined,
    usage: [] as UsageEntry[],
    drafts: [] as { channel: DraftChannel; lang: Lang; body: string }[],
    spent: 0,
    keys: { anthropic: 'sk', exa: 'exa' } as Record<string, string | undefined>,
  }
  const store: ComposeDeps['store'] = {
    composition: async () => ({ ...state.row }),
    updateComposition: async (_id, fields) => void Object.assign(state.row, fields),
    media: async () => (state.media ? { ...state.media } : null),
    updateMedia: async (_id, fields) => void Object.assign(state.media!, fields),
    mediaBytes: async () => new Uint8Array([1, 2, 3]),
    saveDrafts: async (_c, posts) => void state.drafts.push(...posts),
    monthCostUsd: async () => state.spent,
    key: async (_w, provider) => state.keys[provider],
    logUsage: async (_c, entry) => void state.usage.push(entry),
  }
  return { state, store }
}

const usage = {
  input_tokens: 1000,
  output_tokens: 500,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

function deps(store: ComposeDeps['store'], output: unknown, overrides: Partial<ComposeDeps> = {}) {
  const calls: StructuredCall[] = []
  const model: ComposeModel = async (call) => {
    calls.push(call)
    return { ok: true, output: output as never, usage, model: 'claude-sonnet-5-5' }
  }
  return {
    calls,
    deps: {
      store,
      model,
      fetchSource: vi.fn(async () => 'Texte de la page source.'),
      search: vi.fn(),
      ...overrides,
    } as ComposeDeps,
  }
}

const posts = {
  insufficient_material: false,
  posts: {
    linkedin: { fr: 'Post LinkedIn', en: 'LinkedIn post' },
    bluesky: { fr: 'Post Bluesky', en: '' },
  },
}

describe('prompt', () => {
  it('grounds the posts in the material of the mode, rules from the settings', () => {
    const notes = composeSystemPrompt({ name_en: 'Example', config }, 'notes')
    expect(notes).toContain("the person's own notes")
    expect(notes).toContain('Phrases courtes.')
    const search = composeSystemPrompt({ name_en: 'Example', config }, 'search')
    expect(search).toContain('search results')
    expect(search).toContain('never add facts from memory')
  })

  it('gives the limits with room for the link, then the material', () => {
    const message = composeUserMessage(
      {
        subject: 'S',
        notes: 'N',
        link: 'https://example.org/a',
        sources: [{ url: 'https://s.example', title: 'Source', text: 'Texte' }],
      },
      ['bluesky'],
    )
    expect(message).toContain('bluesky 277 characters')
    expect(message).toContain('Source 1: Source (https://s.example)')
  })
})

describe('compositionChannels', () => {
  it('keeps the chosen networks the topic publishes to, else all of them', () => {
    expect(compositionChannels(config, ['bluesky', 'discord'])).toEqual(['bluesky'])
    expect(compositionChannels(config, [])).toEqual(expect.arrayContaining(['linkedin', 'bluesky']))
  })
})

describe('runComposeDraft', () => {
  it('writes the posts from the notes and logs the cost on the topic', async () => {
    const { state, store } = fakeStore(composition())
    const { deps: d, calls } = deps(store, posts)
    expect(await runComposeDraft(d, 'c1')).toBe('done')
    expect(state.drafts).toEqual([
      { channel: 'linkedin', lang: 'fr', body: 'Post LinkedIn' },
      { channel: 'linkedin', lang: 'en', body: 'LinkedIn post' },
      { channel: 'bluesky', lang: 'fr', body: 'Post Bluesky' },
    ])
    expect(state.row.draft_status).toBe('idle')
    expect(state.usage[0]).toMatchObject({ provider: 'anthropic', operation: 'compose' })
    expect(calls[0]!.content).toContain('Sortie de la version 2')
    expect(d.fetchSource).not.toHaveBeenCalled()
  })

  it('reads the chosen links once, and keeps their text', async () => {
    const { state, store } = fakeStore(
      composition({
        mode: 'links',
        notes: '',
        sources: [
          { url: 'https://a.example', title: 'A', selected: true },
          { url: 'https://b.example', title: 'B', selected: false },
        ],
      }),
    )
    const { deps: d, calls } = deps(store, posts)
    expect(await runComposeDraft(d, 'c1')).toBe('done')
    expect(d.fetchSource).toHaveBeenCalledTimes(1)
    expect(calls[0]!.content).toContain('Texte de la page source.')
    expect(calls[0]!.content).not.toContain('https://b.example')
    expect(state.row.sources[0]!.text).toBe('Texte de la page source.')
  })

  it('stops without material, budget or key', async () => {
    const empty = fakeStore(composition({ notes: '', mode: 'notes' }))
    expect(await runComposeDraft(deps(empty.store, posts).deps, 'c1')).toBe('insufficient_content')

    const spent = fakeStore(composition())
    spent.state.spent = 10
    expect(await runComposeDraft(deps(spent.store, posts).deps, 'c1')).toBe('budget_exceeded')

    const noKey = fakeStore(composition())
    noKey.state.keys.anthropic = undefined
    expect(await runComposeDraft(deps(noKey.store, posts).deps, 'c1')).toBe(
      'missing_credential:anthropic',
    )
    expect(noKey.state.row.draft_status).toBe('failed')
  })

  it('reports thin material found by the model', async () => {
    const { state, store } = fakeStore(composition())
    const { deps: d } = deps(store, { insufficient_material: true, posts: {} })
    expect(await runComposeDraft(d, 'c1')).toBe('insufficient_content')
    expect(state.drafts).toEqual([])
    expect(state.usage).toHaveLength(1)
  })
})

describe('runComposeResearch', () => {
  it('keeps the chosen sources and adds the new results', async () => {
    const { state, store } = fakeStore(
      composition({
        mode: 'search',
        research_status: 'pending',
        sources: [
          { url: 'https://kept.example', title: 'Kept', selected: true },
          { url: 'https://old.example', title: 'Old', selected: false },
        ],
      }),
    )
    const search = vi.fn(async () => ({
      ok: true as const,
      results: [
        { url: 'https://kept.example', title: 'Kept again', text: 'x' },
        { url: 'https://new.example', title: 'New', text: 'Un long texte.' },
      ],
      cost_usd: 0.005,
    }))
    const { deps: d } = deps(store, posts, { search })
    expect(await runComposeResearch(d, 'c1')).toBe('done')
    expect(search).toHaveBeenCalledWith('exa', 'Notre nouvelle version', [])
    expect(state.row.sources.map((s) => s.url)).toEqual([
      'https://kept.example',
      'https://new.example',
    ])
    expect(state.row.sources[1]).toMatchObject({ excerpt: 'Un long texte.', selected: false })
    expect(state.usage[0]).toMatchObject({ provider: 'exa', cost_usd: 0.005 })
  })

  it('needs an Exa key', async () => {
    const { state, store } = fakeStore(composition({ research_status: 'pending' }))
    state.keys.exa = undefined
    expect(await runComposeResearch(deps(store, posts).deps, 'c1')).toBe('missing_credential:exa')
  })
})

describe('runDescribeMedia', () => {
  const media: MediaRow = {
    id: 'm1',
    composition_id: 'c1',
    storage_path: 't1/c1/a.jpg',
    mime: 'image/jpeg',
    alt: { fr: 'Mon texte' },
    alt_proposed: [],
    alt_status: 'pending',
  }

  it('proposes only the languages still empty, and marks them', async () => {
    const { state, store } = fakeStore(composition(), media)
    const { deps: d, calls } = deps(store, { alt: { en: 'A screenshot of the new version' } })
    expect(await runDescribeMedia(d, 'm1')).toBe('done')
    expect(state.media!.alt).toEqual({ fr: 'Mon texte', en: 'A screenshot of the new version' })
    expect(state.media!.alt_proposed).toEqual(['en'])
    expect(state.media!.alt_status).toBe('idle')
    const content = calls[0]!.content as { type: string }[]
    expect(content[0]!.type).toBe('image')
    expect(state.usage[0]).toMatchObject({ operation: 'alt_text' })
  })

  it('does nothing when every language has its text', async () => {
    const { store } = fakeStore(composition(), { ...media, alt: { fr: 'a', en: 'b' } })
    const { deps: d, calls } = deps(store, {})
    expect(await runDescribeMedia(d, 'm1')).toBe('nothing_to_do')
    expect(calls).toHaveLength(0)
  })
})
