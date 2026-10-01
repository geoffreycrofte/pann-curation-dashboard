import { describe, expect, it } from 'vitest'
import { effectiveIntervalHours, isSourceDue } from './schedule'
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

  it('never runs an inactive source', () => {
    expect(isSourceDue({ ...legal, active: false, last_run_at: null }, config, now)).toBe(false)
  })
})
