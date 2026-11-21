import { describe, expect, it } from 'vitest'
import { backlogLimitOf, effectiveIntervalHours, isBacklogFull, isSourceDue } from './schedule'
import { parseTopicConfig } from './topic-config'

const config = parseTopicConfig({})
const now = new Date('2026-10-10T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString()

describe('effectiveIntervalHours', () => {
  it('uses the topic interval of the source kind', () => {
    const base = { active: true, interval_hours: null, last_run_at: null }
    expect(effectiveIntervalHours({ ...base, default_kind: 'legal' }, config)).toBe(48)
    expect(effectiveIntervalHours({ ...base, default_kind: 'tool' }, config)).toBe(168)
    expect(effectiveIntervalHours({ ...base, default_kind: null }, config)).toBe(24)
  })

  it('prefers the source override', () => {
    const source = {
      active: true,
      default_kind: 'tool' as const,
      interval_hours: 12,
      last_run_at: null,
    }
    expect(effectiveIntervalHours(source, config)).toBe(12)
  })
})

describe('isSourceDue', () => {
  const legal = { active: true, default_kind: 'legal' as const, interval_hours: null }

  it('runs a source that never ran', () => {
    expect(isSourceDue({ ...legal, last_run_at: null }, config, now)).toBe(true)
  })

  it('waits for the interval, with a small tolerance for cron jitter', () => {
    expect(isSourceDue({ ...legal, last_run_at: hoursAgo(47) }, config, now)).toBe(false)
    expect(isSourceDue({ ...legal, last_run_at: hoursAgo(47.95) }, config, now)).toBe(true)
  })

  it('runs a source the user asked to collect since its last run', () => {
    const source = { ...legal, last_run_at: hoursAgo(1) }
    expect(isSourceDue({ ...source, run_requested_at: hoursAgo(0.5) }, config, now)).toBe(true)
    expect(isSourceDue({ ...source, run_requested_at: hoursAgo(2) }, config, now)).toBe(false)
  })

  it('never runs an inactive source', () => {
    expect(isSourceDue({ ...legal, active: false, last_run_at: null }, config, now)).toBe(false)
  })
})

describe('backlog pause', () => {
  it('reads the limit of each tool and waits from the limit on', () => {
    const config = parseTopicConfig({
      collection: { pause_above: 100 },
      engagement: { pause_above: 20 },
    })
    expect(backlogLimitOf(config, 'curation')).toBe(100)
    expect(backlogLimitOf(config, 'engagement')).toBe(20)
    expect(backlogLimitOf(parseTopicConfig({}), 'curation')).toBeNull()
    expect(isBacklogFull(99, 100)).toBe(false)
    expect(isBacklogFull(100, 100)).toBe(true)
    expect(isBacklogFull(10_000, null)).toBe(false)
  })
})
