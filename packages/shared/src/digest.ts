import { addDays, zonedDay, zonedTimeToUtc } from './diffusion'
import type { Lang } from './domain'
import type { TopicConfig } from './topic-config'

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

function weekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Most recent scheduled time of the newsletter, at or before `now`. */
export function lastDigestTime(schedule: TopicConfig['schedule'], now = new Date()): Date {
  const today = zonedDay(now, schedule.timezone)
  for (let i = 0; i <= 7; i++) {
    const day = addDays(today, -i)
    if (weekdayOf(day) !== schedule.digest.weekday) continue
    const at = zonedTimeToUtc(day, schedule.digest.time, schedule.timezone)
    if (at.getTime() <= now.getTime()) return at
  }
  // Unreachable: a weekday comes back within 7 days.
  return now
}

/** Next scheduled time of the newsletter, after `now`. */
export function nextDigestTime(schedule: TopicConfig['schedule'], now = new Date()): Date {
  const today = zonedDay(now, schedule.timezone)
  for (let i = 0; i <= 7; i++) {
    const day = addDays(today, i)
    if (weekdayOf(day) !== schedule.digest.weekday) continue
    const at = zonedTimeToUtc(day, schedule.digest.time, schedule.timezone)
    if (at.getTime() > now.getTime()) return at
  }
  return now
}

/** Without a previous issue nor a first-issue day, a newsletter covers the last 7 days. */
export const DEFAULT_DIGEST_DAYS = 7

/**
 * How far back an issue looks for items scheduled or published. After a sent issue: from
 * where that issue started, so an item it missed (no summary yet) gets a second chance;
 * items already sent are left out by the issue records. First issue: from the day set by
 * the user (midnight, time zone of the topic), else DEFAULT_DIGEST_DAYS back.
 */
export function digestWindowStart(
  lastSentFrom: Date | null,
  config: Pick<TopicConfig, 'newsletter' | 'schedule'>,
  now = new Date(),
): Date {
  if (lastSentFrom) return lastSentFrom
  const day = config.newsletter.first_issue_from
  if (day) return zonedTimeToUtc(day, '00:00', config.schedule.timezone)
  return new Date(now.getTime() - DEFAULT_DIGEST_DAYS * 24 * 3600_000)
}

// ---------------------------------------------------------------------------
// What
// ---------------------------------------------------------------------------

export interface DigestItem {
  title: string
  url: string
  summary: string
  /** Language of the title (titles stay in the language of the source). */
  source_lang: string | null
}

export interface DigestInput {
  lang: Lang
  /** Newsletter name; the topic name when the user did not set one. */
  title: string
  intro: string
  items: DigestItem[]
  /** Date of the issue, written in the language of the issue. */
  date: Date
  timezone: string
  /** Preview in the board: Brevo placeholders are not replaced there. */
  preview?: boolean
}

/**
 * Fixed texts of the email: links that the law or the email clients require. Everything
 * the user may want to change (name, introduction) comes from the topic settings.
 */
export const DIGEST_STRINGS: Record<Lang, { mirror: string; unsubscribe: string; reason: string }> =
  {
    fr: {
      mirror: 'Voir dans le navigateur',
      unsubscribe: 'Se désabonner',
      reason: 'Vous recevez cette newsletter suite à votre inscription.',
    },
    en: {
      mirror: 'View in your browser',
      unsubscribe: 'Unsubscribe',
      reason: 'You receive this newsletter because you subscribed to it.',
    },
  }

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]!)
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function paragraphs(text: string, style: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${style}">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

export function digestSubject(input: Pick<DigestInput, 'lang' | 'title' | 'date' | 'timezone'>) {
  const date = new Intl.DateTimeFormat(input.lang, {
    dateStyle: 'long',
    timeZone: input.timezone,
  }).format(input.date)
  return `${input.title}, ${date}`
}

// Email colors: dark text on white, contrast above 7:1 for the text, 4.5:1 for the meta.
const INK = '#141414'
const MUTED = '#5f5a4e'
const LINK = '#5c4300'
const PAGE = '#f6f3ea'
const LINE = '#e6e1d3'
const FONT = 'font-family:Arial,Helvetica,sans-serif;'

/**
 * Accessible HTML email: language declared, content wrapped as recommended by the Email
 * Markup Consortium (role="article", labelled by the subject, since webmails strip
 * <html lang>), layout tables marked as presentation, real headings, underlined links,
 * readable sizes, no text in images.
 */
export function renderDigest(input: DigestInput): { subject: string; html: string } {
  const s = DIGEST_STRINGS[input.lang]
  const subject = digestSubject(input)
  const date = new Intl.DateTimeFormat(input.lang, {
    dateStyle: 'full',
    timeZone: input.timezone,
  }).format(input.date)
  const mirror = input.preview ? '#' : '{{ mirror }}'
  const unsubscribe = input.preview ? '#' : '{{ unsubscribe }}'

  const items = input.items
    .map((item) => {
      const titleLang =
        item.source_lang && item.source_lang !== input.lang
          ? ` lang="${escapeHtml(item.source_lang)}"`
          : ''
      return `<tr><td style="padding:20px 28px;border-top:1px solid ${LINE};${FONT}color:${INK};">
<h2 style="margin:0 0 8px;font-size:19px;line-height:1.35;"><a href="${escapeHtml(item.url)}"${titleLang} style="color:${INK};text-decoration:underline;">${escapeHtml(item.title)}</a></h2>
<p style="margin:0 0 8px;font-size:16px;line-height:1.55;">${escapeHtml(item.summary)}</p>
<p style="margin:0;font-size:13px;line-height:1.4;color:${MUTED};">${escapeHtml(host(item.url))}</p>
</td></tr>`
    })
    .join('\n')

  const html = `<!doctype html>
<html lang="${input.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
<div role="article" aria-roledescription="email" aria-label="${escapeHtml(subject)}" lang="${input.lang}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;">
<tr><td style="padding:24px 28px 16px;${FONT}color:${INK};">
<p style="margin:0 0 20px;font-size:13px;"><a href="${mirror}" style="color:${LINK};text-decoration:underline;">${escapeHtml(s.mirror)}</a></p>
<h1 style="margin:0;font-size:28px;line-height:1.2;">${escapeHtml(input.title)}</h1>
<p style="margin:8px 0 0;font-size:14px;color:${MUTED};">${escapeHtml(date)}</p>
${paragraphs(input.intro, 'margin:16px 0 0;font-size:16px;line-height:1.55;')}
</td></tr>
${items}
<tr><td style="padding:20px 28px 24px;border-top:1px solid ${LINE};${FONT}font-size:13px;line-height:1.5;color:${MUTED};">
<p style="margin:0 0 8px;">${escapeHtml(s.reason)}</p>
<p style="margin:0;"><a href="${unsubscribe}" style="color:${LINK};text-decoration:underline;">${escapeHtml(s.unsubscribe)}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</div>
</body>
</html>`
  return { subject, html }
}
