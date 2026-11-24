import { escapeHtml } from '@glimr/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
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
 * In French and in English: the interface language is kept in the browser, not here.
 */
export function streakEmail(warning: StreakWarning, from: string, siteUrl: string): ServiceEmail {
  const link = `${siteUrl}/t/${warning.topic_id}/calendar`
  const n = warning.weeks
  const fr = [
    `Votre série de ${n} semaine${n > 1 ? 's' : ''} de publication sur « ${warning.name_fr} » s’arrête dimanche soir : rien n’est publié ni programmé cette semaine.`,
    'Programmez au moins un post d’ici là pour la garder :',
  ]
  const en = [
    `Your ${n}-week publishing streak on “${warning.name_en}” ends on Sunday night: nothing is published or scheduled this week.`,
    'Schedule at least one post by then to keep it:',
  ]
  const block = (lang: string, lines: string[]) =>
    `<div lang="${lang}">${lines.map((l) => `<p style="margin:0 0 12px;">${escapeHtml(l)}</p>`).join('')}<p style="margin:0 0 24px;"><a href="${escapeHtml(link)}" style="color:#5c4300;">${escapeHtml(link)}</a></p></div>`
  return {
    from,
    to: warning.emails,
    subject: `🔥 ${n} semaine${n > 1 ? 's' : ''} : votre série s’arrête dimanche / Your streak ends on Sunday`,
    text: [...fr, link, '', '---', '', ...en, link].join('\n\n'),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#141414;">${block('fr', fr)}<hr style="border:0;border-top:1px solid #ddd;margin:24px 0;">${block('en', en)}</div>`,
    idempotencyKey: `glimr-streak-${warning.topic_id}-${warning.week_start.slice(0, 10)}`,
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

  for (const warning of warnings) {
    if (!warning.emails.length) {
      report.skipped++
      continue
    }
    const result = await send(
      key,
      streakEmail(warning, settings.data.email_from, settings.data.site_url),
    )
    if (!result.ok) {
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
