import type { ItemKind } from './domain'
import type { TopicConfig } from './topic-config'

export interface SchedulableSource {
  active: boolean
  default_kind: ItemKind | null
  interval_hours: number | null
  last_run_at: string | null
}

/** Source override, else the topic interval for the source's kind, else the topic default. */
export function effectiveIntervalHours(source: SchedulableSource, config: TopicConfig): number {
  if (source.interval_hours) return source.interval_hours
  if (source.default_kind) return config.collection.intervals_hours[source.default_kind]
  return config.collection.default_hours
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
  const elapsedMs = now.getTime() - new Date(source.last_run_at).getTime()
  const toleranceMs = 5 * 60 * 1000
  return elapsedMs + toleranceMs >= effectiveIntervalHours(source, config) * 3600 * 1000
}
