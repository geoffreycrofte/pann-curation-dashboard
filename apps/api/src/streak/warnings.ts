import type { SupabaseClient } from '@supabase/supabase-js'
import {
  emailLangs,
  langsOf,
  renderEmail,
  type EmailContent,
  type EmailLang,
} from '../lib/email-layout'
import { sendResendEmail, type SendResult, type ServiceEmail } from '../lib/resend'

export interface StreakWarning {
  topic_id: string
  name_fr: string
  name_en: string
  weeks: number
  week_start: string
  emails: string[]
}

/**
 * Friday warning: the streak of a topic breaks on Sunday unless something is published.
 * In the owners' language (both when unknown).
 */
export function streakEmail(
  warning: StreakWarning,
  from: string,
  siteUrl: string,
  lang?: string | null,
): ServiceEmail {
  const link = `${siteUrl}/t/${warning.topic_id}/calendar`
  const n = warning.weeks
  const langs = emailLangs(lang)
  const contents: Partial<Record<EmailLang, EmailContent>> = {
    fr: {
      subject: `🔥 ${n} semaine${n > 1 ? 's' : ''} : votre série s’arrête dimanche`,
      heading: `Votre série de ${n} semaine${n > 1 ? 's' : ''} s’arrête dimanche`,
      paragraphs: [
        `Rien n’est publié ni programmé cette semaine sur « ${warning.name_fr} ».`,
        'Programmez au moins un post d’ici dimanche soir pour garder votre série.',
      ],
      button: { label: 'Ouvrir le calendrier', url: link },
    },
    en: {
      subject: `🔥 ${n} week${n > 1 ? 's' : ''}: your streak ends on Sunday`,
      heading: `Your ${n}-week streak ends on Sunday`,
      paragraphs: [
        `Nothing is published or scheduled this week on “${warning.name_en}”.`,
        'Schedule at least one post by Sunday night to keep your streak.',
      ],
      button: { label: 'Open the calendar', url: link },
    },
  }
  const email = renderEmail(siteUrl, Object.fromEntries(langs.map((l) => [l, contents[l]])))
  return {
    from,
    to: warning.emails,
    ...email,
    idempotencyKey: `glimr-streak-${warning.topic_id}-${warning.week_start.slice(0, 10)}${lang ? `-${lang}` : ''}`,
  }
}

/**
 * Hourly: warns the owners of the topics whose streak would break on Sunday (Friday, from
 * 9 a.m. in the topic's time zone; never for a paused topic). Needs Glimr's Resend key and
 * sender. `db` uses the secret key.
 */
export async function sendStreakWarnings(
  db: SupabaseClient,
  send: (key: string, email: ServiceEmail) => Promise<SendResult> = sendResendEmail,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const report = { sent: 0, failed: 0, skipped: 0 }
  const { data, error } = await db.rpc('streak_warnings_for_jobs')
  if (error) throw error
  const warnings = (data ?? []) as StreakWarning[]
  if (!warnings.length) return report

  const [keys, settings] = await Promise.all([
    db.rpc('platform_credentials_for_jobs'),
    db
      .from('platform_settings')
      .select('email_from, site_url')
      .single<{ email_from: string; site_url: string }>(),
  ])
  if (keys.error) throw keys.error
  if (settings.error) throw settings.error
  const key = ((keys.data ?? []) as { provider: string; secret: string }[]).find(
    (k) => k.provider === 'resend',
  )?.secret
  if (!key || !settings.data.email_from) {
    report.skipped = warnings.length
    return report
  }

  const langs = await langsOf(db, [...new Set(warnings.flatMap((w) => w.emails))])
  for (const warning of warnings) {
    if (!warning.emails.length) {
      report.skipped++
      continue
    }
    // One e-mail per language of the owners (one owner: one e-mail).
    const groups = new Map<string | null, string[]>()
    for (const email of warning.emails) {
      const lang = langs.get(email.toLowerCase()) ?? null
      groups.set(lang, [...(groups.get(lang) ?? []), email])
    }
    let ok = true
    for (const [lang, emails] of groups) {
      const result = await send(
        key,
        streakEmail({ ...warning, emails }, settings.data.email_from, settings.data.site_url, lang),
      )
      if (!result.ok) ok = false
    }
    if (!ok) {
      report.failed++
      continue
    }
    const { error: insertError } = await db
      .from('streak_warnings')
      .insert({ topic_id: warning.topic_id, week_start: warning.week_start })
    if (insertError) throw insertError
    report.sent++
  }
  return report
}
