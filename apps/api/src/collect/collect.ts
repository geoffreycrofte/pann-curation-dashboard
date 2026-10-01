import { isSourceDue, normalizeUrl } from '@pann/shared'
import {
  SourceError,
  type Adapter,
  type CollectSecrets,
  type CollectSource,
  type CollectedItem,
  type UsageEntry,
} from './types'

export interface IngestRow {
  canonical_url: string
  title: string
  content: string | null
  published_at: string | null
  source_lang: string | null
  kind: string | null
  change_signature: string | null
}

export interface IngestStats {
  new_items: number
  linked: number
  duplicates: number
  reopened: number
  known: number
}

/** Persistence used by the collector (Supabase with the secret key in production). */
export interface CollectStore {
  activeSources(): Promise<CollectSource[]>
  ingest(topicId: string, rows: IngestRow[]): Promise<IngestStats>
  finishRun(sourceId: string, result: { at: Date; error: string | null }): Promise<void>
  logUsage(source: CollectSource, usage: UsageEntry[]): Promise<void>
}

export interface SourceReport {
  source_id: string
  label: string
  collected: number
  stats?: IngestStats
  error?: string
}

/** Bounds the work of one cron invocation (time and Workers subrequests). */
export const MAX_SOURCES_PER_RUN = 10
/** Re-read a little before the last run, for entries published late or dated in the past. */
const OVERLAP_MS = 2 * 24 * 3600 * 1000

export function collectionWindowStart(source: CollectSource, now: Date): Date {
  const maxAge = new Date(
    now.getTime() - source.topic_config.collection.max_age_days * 86400 * 1000,
  )
  if (!source.last_run_at) return maxAge
  const sinceLastRun = new Date(Date.parse(source.last_run_at) - OVERLAP_MS)
  return sinceLastRun > maxAge ? sinceLastRun : maxAge
}

export function toIngestRows(items: CollectedItem[]): IngestRow[] {
  const rows = new Map<string, IngestRow>()
  for (const item of items) {
    let canonical: string
    try {
      canonical = normalizeUrl(item.url)
    } catch {
      continue
    }
    if (rows.has(canonical)) continue
    rows.set(canonical, {
      canonical_url: canonical,
      title: item.title,
      content: item.content ?? null,
      published_at: item.published_at ?? null,
      source_lang: item.source_lang ?? null,
      kind: item.kind ?? null,
      change_signature: item.change_signature ?? null,
    })
  }
  return [...rows.values()]
}

/**
 * One collection pass: runs the due sources (oldest run first), ingests their items,
 * records the outcome on each source. A failing source never stops the others.
 */
export async function collect(deps: {
  store: CollectStore
  adapters: Record<string, Adapter>
  secrets: CollectSecrets
  now?: Date
  maxSources?: number
}): Promise<SourceReport[]> {
  const now = deps.now ?? new Date()
  const due = (await deps.store.activeSources())
    .filter((s) => isSourceDue(s, s.topic_config, now))
    .sort((a, b) => (a.last_run_at ?? '').localeCompare(b.last_run_at ?? ''))
    .slice(0, deps.maxSources ?? MAX_SOURCES_PER_RUN)

  const reports: SourceReport[] = []
  for (const source of due) {
    const report: SourceReport = { source_id: source.id, label: source.label, collected: 0 }
    try {
      const adapter = deps.adapters[source.type]
      if (!adapter) throw new SourceError(`No adapter for ${source.type}`)
      const result = await adapter(source, {
        since: collectionWindowStart(source, now),
        secrets: deps.secrets,
      })
      if (result.usage?.length) await deps.store.logUsage(source, result.usage)
      const rows = toIngestRows(result.items)
      report.collected = rows.length
      if (rows.length) report.stats = await deps.store.ingest(source.topic_id, rows)
      await deps.store.finishRun(source.id, { at: now, error: null })
    } catch (err) {
      report.error = err instanceof SourceError ? err.message : 'Unexpected error'
      if (!(err instanceof SourceError)) console.error(`collect ${source.id}`, err)
      await deps.store.finishRun(source.id, { at: now, error: report.error.slice(0, 500) })
    }
    reports.push(report)
  }
  return reports
}
