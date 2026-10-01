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
  const store: CollectStore = {
    activeSources: async () => sources,
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
  return { store, ingested, runs, usage }
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
    const { store, ingested, runs, usage } = memoryStore(sources)
    const rss: Adapter = async () => ({ items: [{ url: 'https://example.org/x', title: 'X' }] })
    const exa: Adapter = async () => {
      throw new SourceError('Exa: HTTP 401')
    }

    const reports = await collect({ store, adapters: { rss, exa }, secrets: {}, now })

    expect(reports.map((r) => r.source_id).sort()).toEqual(['failing', 'never-ran'])
    expect(runs).toEqual({ 'never-ran': null, failing: 'Exa: HTTP 401' })
    expect(ingested.t?.map((r) => r.canonical_url)).toEqual(['https://example.org/x'])
    expect(usage).toEqual([])
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
    await collect({ store, adapters: { exa, github }, secrets: {}, now })
    console.error = errors
    expect(usage).toHaveLength(1)
    expect(runs).toEqual({ a: null, b: 'Unexpected error' })
  })

  it('caps the number of sources per run, oldest first', async () => {
    const sources = Array.from({ length: 5 }, (_, i) =>
      source({ id: `s${i}`, last_run_at: `2026-09-0${5 - i}T00:00:00Z` }),
    )
    const { store } = memoryStore(sources)
    const reports = await collect({
      store,
      adapters: { rss: async () => ({ items: [] }) },
      secrets: {},
      now,
      maxSources: 2,
    })
    expect(reports.map((r) => r.source_id)).toEqual(['s4', 's3'])
  })
})
