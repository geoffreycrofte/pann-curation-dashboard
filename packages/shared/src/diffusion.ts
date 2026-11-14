import type { Lang } from './domain'
import {
  DEFAULT_DRAFT_CHANNELS,
  DRAFT_CHANNELS,
  POST_LIMITS,
  postLength,
  type DraftChannel,
} from './drafting'
import type { TopicConfig } from './topic-config'

/** The link to the source goes after the text of the post, separated by a blank line. */
export const LINK_SEPARATOR = '\n\n'

/** Mastodon counts every link as 23 characters, whatever its length. */
const MASTODON_URL_LENGTH = 23

export function composePost(body: string, url: string, signature = ''): string {
  const tail = signature.trim()
  return `${body.trim()}${LINK_SEPARATOR}${url}${tail ? `${LINK_SEPARATOR}${tail}` : ''}`
}

/** Room taken by a signature at the end of the post (blank line included). */
function signatureLength(signature: string): number {
  const tail = signature.trim()
  return tail ? LINK_SEPARATOR.length + postLength(tail) : 0
}

function urlLength(channel: DraftChannel, url: string): number {
  return channel === 'mastodon' ? MASTODON_URL_LENGTH : postLength(url)
}

/** Length of the published post (text, link, signature), as the network counts it. */
export function publishedLength(
  channel: DraftChannel,
  body: string,
  url: string,
  signature = '',
): number {
  return (
    postLength(body.trim()) +
    LINK_SEPARATOR.length +
    urlLength(channel, url) +
    signatureLength(signature)
  )
}

/** Room left for the text once the link (and the signature, if any) is added. */
export function bodyLimit(
  channel: DraftChannel,
  url: string,
  limit: number = POST_LIMITS[channel],
  signature = '',
): number {
  return limit - LINK_SEPARATOR.length - urlLength(channel, url) - signatureLength(signature)
}

/** Text added at the end of every post of this channel and language (LinkedIn only). */
export function postSignature(config: TopicConfig, channel: DraftChannel, lang: Lang): string {
  return channel === 'linkedin' ? config.linkedin.signature[lang] : ''
}

/**
 * First comment of a post: its own choice (`''` turns it off), else the default of the
 * topic. LinkedIn only; `null` when there is none to publish.
 */
export function firstCommentFor(
  config: TopicConfig,
  channel: DraftChannel,
  lang: Lang,
  own: string | null,
): string | null {
  if (channel !== 'linkedin') return null
  const text = (own ?? config.linkedin.first_comment[lang]).trim()
  return text || null
}

export type ChannelAccount = TopicConfig['channels'][number]

/** Account that publishes this channel in this language, if the topic has one. */
export function accountFor(
  config: TopicConfig,
  channel: DraftChannel,
  lang: Lang,
): ChannelAccount | undefined {
  return config.channels.find((c) => c.channel === channel && c.langs.includes(lang))
}

/** Channels with at least one account, for the scheduling of an item. */
export function configuredChannels(config: TopicConfig): DraftChannel[] {
  return [...new Set(config.channels.map((c) => c.channel))]
}

/** Channels drafted for an item of this topic: the default ones and those it publishes to. */
export function draftChannels(config: TopicConfig): DraftChannel[] {
  const used = new Set<DraftChannel>([...DEFAULT_DRAFT_CHANNELS, ...configuredChannels(config)])
  return DRAFT_CHANNELS.filter((c) => used.has(c))
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

/** Publication times actually used each day: sorted, at most `posts_per_day`. */
export function dailySlots(schedule: TopicConfig['schedule']): string[] {
  return [...new Set(schedule.slots)].sort().slice(0, schedule.posts_per_day)
}

const pad = (n: number) => String(n).padStart(2, '0')

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/** Offset of the time zone at this instant, in milliseconds (UTC+2 gives 7 200 000). */
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** Calendar day (YYYY-MM-DD) of an instant in a time zone. */
export function zonedDay(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** Instant of a wall-clock time (day YYYY-MM-DD, time HH:MM) in a time zone. */
export function zonedTimeToUtc(day: string, time: string, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const [hh, mm] = time.split(':').map(Number) as [number, number]
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  // Two passes: the offset can change between the guess and the result (DST).
  const first = wall - offsetMs(new Date(wall), timeZone)
  return new Date(wall - offsetMs(new Date(first), timeZone))
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Monday (YYYY-MM-DD) of the week of a calendar day: weeks start on Monday. */
export function startOfWeek(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDays(day, -((weekday + 6) % 7))
}

/** A slot closer than this is skipped: it leaves time to read the posts once more. */
export const MIN_LEAD_MINUTES = 5

/**
 * Next slot of the topic that no item uses yet, or null when the queue is paused
 * (no daily slot) or full over the horizon.
 */
export function nextFreeSlot(
  schedule: TopicConfig['schedule'],
  taken: readonly (string | Date)[],
  now = new Date(),
  horizonDays = 90,
): Date | null {
  const times = dailySlots(schedule)
  if (!times.length) return null
  const busy = new Set(taken.map((t) => new Date(t).getTime()))
  const earliest = now.getTime() + MIN_LEAD_MINUTES * 60 * 1000
  const today = zonedDay(now, schedule.timezone)
  for (let i = 0; i <= horizonDays; i++) {
    const day = addDays(today, i)
    for (const time of times) {
      const slot = zonedTimeToUtc(day, time, schedule.timezone)
      if (slot.getTime() >= earliest && !busy.has(slot.getTime())) return slot
    }
  }
  return null
}
