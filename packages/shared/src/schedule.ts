import type { ItemKind } from './domain'
import type { TopicConfig } from './topic-config'

export interface SchedulableSource {
  active: boolean
  default_kind: ItemKind | null
  interval_hours: number | null
  last_run_at: string | null
  /** Set by the user ("collect at next run"). */
  run_requested_at?: string | null
}

/**
 * Source override, else the topic interval for the source's kind, else the topic default
 * (also for a kind without its own interval).
 */
export function effectiveIntervalHours(source: SchedulableSource, config: TopicConfig): number {
  if (source.interval_hours) return source.interval_hours
  const byKind = source.default_kind
    ? config.collection.intervals_hours[source.default_kind]
    : undefined
  return byKind ?? config.collection.default_hours
}

/**
 * Collection crons run often (hourly) and only process the sources that are due.
 * A 5-minute tolerance absorbs cron jitter, so a 24 h source does not slip by an hour each day.
 */
export function isSourceDue(
  source: SchedulableSource,
  config: TopicConfig,
  now = new Date(),
): boolean {
  if (!source.active) return false
  if (!source.last_run_at) return true
  if (
    source.run_requested_at &&
    Date.parse(source.run_requested_at) > Date.parse(source.last_run_at)
  )
    return true
  const elapsedMs = now.getTime() - new Date(source.last_run_at).getTime()
  const toleranceMs = 5 * 60 * 1000
  return elapsedMs + toleranceMs >= effectiveIntervalHours(source, config) * 3600 * 1000
}
