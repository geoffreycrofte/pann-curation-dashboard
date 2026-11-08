import { parseTopicConfig } from '@pann/shared'
import { describe, expect, it } from 'vitest'
import {
  collect,
  collectionWindowStart,
  toIngestRows,
  type CollectStore,
  type IngestRow,
} from './collect'
import { SourceError, type Adapter, type CollectSource } from './types'

const now = new Date('2026-10-10T12:00:00Z')
const config = parseTopicConfig({})

function source(overrides: Partial<CollectSource>): CollectSource {
  return {
    id: 's',
    topic_id: 't',
    workspace_id: 'w',
    type: 'rss',
    label: 'Feed',
    config: {},
    active: true,
    default_kind: null,
    interval_hours: null,
    last_run_at: null,
    run_requested_at: null,
    topic_config: config,
    ...overrides,
  }
}

function memoryStore(sources: CollectSource[]) {
  const ingested: Record<string, IngestRow[]> = {}
  const runs: Record<string, string | null> = {}
  const usage: unknown[] = []
  const invalid: string[] = []
  const ok: string[] = []
  const store: CollectStore = {
    activeSources: async () => sources,
    credentials: async (workspaceId) => (workspaceId === 'w' ? { exa: 'key' } : {}),
    markCredentialInvalid: async (workspaceId, provider) => {
      invalid.push(`${workspaceId}/${provider}`)
    },
    markCredentialOk: async (workspaceId, provider) => {
      ok.push(`${workspaceId}/${provider}`)
    },
    ingest: async (topicId, rows) => {
      ingested[topicId] = [...(ingested[topicId] ?? []), ...rows]
      return { new_items: rows.length, linked: rows.length, duplicates: 0, reopened: 0, known: 0 }
    },
    finishRun: async (id, { error }) => {
      runs[id] = error
    },
    logUsage: async (_s, entries) => {
      usage.push(...entries)
    },
  }
  return { store, ingested, runs, usage, invalid, ok }
}

describe('toIngestRows', () => {
  it('normalises URLs, drops invalid ones and duplicates within a batch', () => {
    const rows = toIngestRows([
      { url: 'http://www.example.org/a/?utm_source=x', title: 'A' },
      { url: 'https://example.org/a', title: 'A again' },
      { url: 'mailto:x@example.org', title: 'Mail' },
    ])
    expect(rows.map((r) => [r.canonical_url, r.title])).toEqual([['https://example.org/a', 'A']])
  })
})

describe('collectionWindowStart', () => {
  it('uses the max age for a first run, and the last run minus an overlap afterwards', () => {
    expect(collectionWindowStart(source({}), now).toISOString()).toBe('2026-09-10T12:00:00.000Z')
    expect(
      collectionWindowStart(source({ last_run_at: '2026-10-09T12:00:00Z' }), now).toISOString(),
    ).toBe('2026-10-07T12:00:00.000Z')
  })
})

describe('collect', () => {
  it('runs due sources only, ingests per topic and records errors without stopping', async () => {
    const sources = [
      source({ id: 'never-ran', type: 'rss' }),
      source({ id: 'failing', type: 'exa', last_run_at: '2026-10-01T00:00:00Z' }),
      source({ id: 'recent', type: 'rss', last_run_at: '2026-10-10T11:00:00Z' }),
      source({ id: 'inactive', type: 'rss', active: false }),
    ]
    const { store, ingested, runs, usage, invalid } = memoryStore(sources)
    const rss: Adapter = async () => ({ items: [{ url: 'https://example.org/x', title: 'X' }] })
    const exa: Adapter = async () => {
      throw new SourceError('invalid_credential', 'exa')
    }

    const reports = await collect({ store, adapters: { rss, exa }, now })

    expect(reports.map((r) => r.source_id).sort()).toEqual(['failing', 'never-ran'])
    expect(runs).toEqual({ 'never-ran': null, failing: 'invalid_credential:exa' })
    expect(invalid).toEqual(['w/exa'])
    expect(ingested.t?.map((r) => r.canonical_url)).toEqual(['https://example.org/x'])
    expect(usage).toEqual([])
  })

  it('marks the Exa key as checked after a successful collection, once per pass', async () => {
    const { store, ok, invalid } = memoryStore([
      source({ id: 'a', type: 'exa' }),
      source({ id: 'b', type: 'exa' }),
      source({ id: 'c', type: 'rss' }),
    ])
    const empty: Adapter = async () => ({ items: [] })
    await collect({ store, adapters: { exa: empty, rss: empty }, now })
    expect(ok).toEqual(['w/exa'])
    expect(invalid).toEqual([])
  })

  it('never ingests items from a site excluded from the topic', async () => {
    const excludedConfig = parseTopicConfig({ collection: { excluded_domains: ['rival.com'] } })
    const { store, ingested } = memoryStore([source({ id: 'a', topic_config: excludedConfig })])
    const rss: Adapter = async () => ({
      items: [
        { url: 'https://blog.rival.com/post', title: 'Rival' },
        { url: 'https://example.org/ok', title: 'Kept' },
      ],
    })
    await collect({ store, adapters: { rss }, now })
    expect(ingested.t?.map((r) => r.canonical_url)).toEqual(['https://example.org/ok'])
  })

  it('passes the workspace keys to the adapters', async () => {
    const { store } = memoryStore([source({ id: 'a', type: 'exa' })])
    let received: unknown
    const exa: Adapter = async (_source, ctx) => {
      received = ctx.secrets
      return { items: [] }
    }
    await collect({ store, adapters: { exa }, now })
    expect(received).toEqual({ exa: 'key' })
  })

  it('pauses the sources of a topic whose curation is turned off', async () => {
    const noCuration = parseTopicConfig({ modules: { curation: false, engagement: true } })
    const { store, runs } = memoryStore([
      source({ id: 'paused', topic_config: noCuration }),
      source({ id: 'running' }),
    ])
    const adapters = { rss: async () => ({ items: [] }) }
    await collect({ store, adapters, now })
    await collect({ store, adapters, now, onlySourceIds: ['paused'] })
    expect(Object.keys(runs)).toEqual(['running'])
  })

  it('"collect now" runs the requested source even when it is not due', async () => {
    const { store, runs } = memoryStore([
      source({ id: 'recent', last_run_at: '2026-10-10T11:30:00Z' }),
      source({ id: 'due' }),
    ])
    await collect({
      store,
      adapters: { rss: async () => ({ items: [] }) },
      now,
      onlySourceIds: ['recent'],
    })
    expect(Object.keys(runs)).toEqual(['recent'])
  })

  it('logs provider usage and hides unexpected error details', async () => {
    const { store, runs, usage } = memoryStore([
      source({ id: 'a', type: 'exa' }),
      source({ id: 'b', type: 'github' }),
    ])
    const exa: Adapter = async () => ({
      items: [],
      usage: [{ provider: 'exa', operation: 'search', units: { searches: 1 }, cost_usd: 0.007 }],
    })
    const github: Adapter = async () => {
      throw new TypeError('secret stack trace')
    }
    const errors = console.error
    console.error = () => {}
    await collect({ store, adapters: { exa, github }, now })
    console.error = errors
    expect(usage).toHaveLength(1)
    expect(runs).toEqual({ a: null, b: 'unexpected' })
  })

  it('caps the number of sources per run, oldest first', async () => {
    const sources = Array.from({ length: 5 }, (_, i) =>
      source({ id: `s${i}`, last_run_at: `2026-09-0${5 - i}T00:00:00Z` }),
    )
    const { store } = memoryStore(sources)
    const reports = await collect({
      store,
      adapters: { rss: async () => ({ items: [] }) },
      now,
      maxSources: 2,
    })
    expect(reports.map((r) => r.source_id)).toEqual(['s4', 's3'])
  })
})
