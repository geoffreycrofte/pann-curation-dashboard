import { describe, expect, it } from 'vitest'
import {
  accountFor,
  bodyLimit,
  composePost,
  dailySlots,
  nextFreeSlot,
  publishedLength,
  startOfWeek,
  zonedTimeToUtc,
} from './diffusion'
import { parseTopicConfig } from './topic-config'

const schedule = parseTopicConfig({}).schedule // Europe/Luxembourg, 09:00 and 16:00

describe('zonedTimeToUtc', () => {
  it('converts summer and winter times of Luxembourg', () => {
    expect(zonedTimeToUtc('2026-10-02', '09:00', 'Europe/Luxembourg').toISOString()).toBe(
      '2026-10-02T07:00:00.000Z',
    )
    expect(zonedTimeToUtc('2026-12-02', '09:00', 'Europe/Luxembourg').toISOString()).toBe(
      '2026-12-02T08:00:00.000Z',
    )
  })

  it('handles the day of the change to winter time', () => {
    // 25 October 2026: clocks go back at 03:00 (CEST to CET).
    expect(zonedTimeToUtc('2026-10-25', '16:00', 'Europe/Luxembourg').toISOString()).toBe(
      '2026-10-25T15:00:00.000Z',
    )
  })
})

describe('startOfWeek', () => {
  it('goes back to the Monday, across months and years', () => {
    expect(startOfWeek('2026-11-10')).toBe('2026-11-09') // Tuesday
    expect(startOfWeek('2026-11-09')).toBe('2026-11-09') // Monday
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09') // Sunday
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28') // Friday
  })
})

describe('nextFreeSlot', () => {
  it('takes the next slot of the day', () => {
    const now = new Date('2026-10-02T06:00:00Z') // 08:00 in Luxembourg
    expect(nextFreeSlot(schedule, [], now)?.toISOString()).toBe('2026-10-02T07:00:00.000Z')
  })

  it('skips taken slots and goes to the next days', () => {
    const now = new Date('2026-10-02T06:00:00Z')
    const taken = ['2026-10-02T07:00:00.000Z', '2026-10-02T14:00:00Z']
    expect(nextFreeSlot(schedule, taken, now)?.toISOString()).toBe('2026-10-03T07:00:00.000Z')
  })

  it('leaves a few minutes before a slot', () => {
    const now = new Date('2026-10-02T06:58:00Z') // 08:58
    expect(nextFreeSlot(schedule, [], now)?.toISOString()).toBe('2026-10-02T14:00:00.000Z')
  })

  it('uses only posts_per_day slots, and none when paused', () => {
    expect(
      dailySlots({ ...schedule, slots: ['16:00', '09:00', '12:00'], posts_per_day: 2 }),
    ).toEqual(['09:00', '12:00'])
    expect(nextFreeSlot({ ...schedule, posts_per_day: 0 }, [])).toBeNull()
  })
})

describe('post length', () => {
  const url = 'https://example.org/a/very/long/path/to/an/article-about-accessibility'

  it('adds the link after a blank line', () => {
    expect(composePost(' Hello ', url)).toBe(`Hello\n\n${url}`)
  })

  it('counts links as Mastodon does', () => {
    expect(publishedLength('mastodon', 'Hello', url)).toBe(5 + 2 + 23)
    expect(publishedLength('bluesky', 'Hello', url)).toBe(5 + 2 + url.length)
    expect(bodyLimit('bluesky', url)).toBe(300 - 2 - url.length)
    expect(bodyLimit('mastodon', url, 1000)).toBe(1000 - 2 - 23)
  })
})

describe('accounts', () => {
  it('finds the account of a channel and language', () => {
    const config = parseTopicConfig({
      channels: [
        { channel: 'linkedin', account_id: 'li-fr', langs: ['fr'] },
        { channel: 'linkedin', account_id: 'li-en', langs: ['en'] },
        { channel: 'mastodon', account_id: 'me@mastodon.social', langs: ['fr', 'en'] },
      ],
    })
    expect(accountFor(config, 'linkedin', 'en')?.account_id).toBe('li-en')
    expect(accountFor(config, 'mastodon', 'fr')?.account_id).toBe('me@mastodon.social')
    expect(accountFor(config, 'bluesky', 'fr')).toBeUndefined()
  })

  it('refuses two accounts for the same channel and language', () => {
    expect(() =>
      parseTopicConfig({
        channels: [
          { channel: 'bluesky', account_id: 'a', langs: ['fr'] },
          { channel: 'bluesky', account_id: 'b', langs: ['fr', 'en'] },
        ],
      }),
    ).toThrow()
  })

  it('drops entries written by an older version', () => {
    expect(
      parseTopicConfig({ channels: [{ channel: 'linkedin', account_ref: 'x' }] }).channels,
    ).toEqual([])
  })

  it('refuses an unknown time zone', () => {
    expect(() => parseTopicConfig({ schedule: { timezone: 'Mars/Olympus' } })).toThrow()
  })
})
