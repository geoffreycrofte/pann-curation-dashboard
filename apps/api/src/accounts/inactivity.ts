import { escapeHtml } from '@glimr/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendResendEmail, type SendResult, type ServiceEmail } from '../lib/resend'

/** UTC hour of the daily run, inside the hourly collection cron. */
export const INACTIVITY_HOUR_UTC = 3

/**
 * Warning before an inactive account is deleted. In French and in English: the language
 * of the interface is kept in the person's browser, not on the server.
 */
export function inactivityEmail(
  user: { user_id: string; email: string },
  from: string,
  siteUrl: string,
  today: string,
): ServiceEmail {
  const login = `${siteUrl}/login`
  const fr = [
    'Bonjour,',
    'Vous ne vous êtes pas connecté à Glimr depuis près d’un an. Comme l’annoncent nos conditions générales, un compte inactif depuis un an est supprimé, avec ses thèmes et ses réglages.',
    'Pour le garder, il suffit de vous connecter dans les 30 prochains jours :',
  ]
  const en = [
    'Hello,',
    'You have not signed in to Glimr for almost a year. As our terms say, an account inactive for a year is deleted, with its topics and settings.',
    'To keep it, simply sign in within the next 30 days:',
  ]
  const text = [...fr, login, '', '---', '', ...en, login].join('\n\n')
  const block = (lang: string, lines: string[]) =>
    `<div lang="${lang}">${lines.map((l) => `<p style="margin:0 0 12px;">${escapeHtml(l)}</p>`).join('')}<p style="margin:0 0 24px;"><a href="${escapeHtml(login)}" style="color:#5c4300;">${escapeHtml(login)}</a></p></div>`
  return {
    from,
    to: [user.email],
    subject:
      'Votre compte Glimr sera supprimé dans 30 jours / Your Glimr account will be deleted in 30 days',
    text,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#141414;">${block('fr', fr)}<hr style="border:0;border-top:1px solid #ddd;margin:24px 0;">${block('en', en)}</div>`,
    idempotencyKey: `glimr-inactivity-${user.user_id}-${today}`,
  }
}

export interface InactivityReport {
  warned: number
  deleted: number
  skipped: number
  failed: number
}

/**
 * Daily job: warns the accounts inactive for 11 months, deletes those warned a month ago
 * and still not back (like a deletion asked from the Profile page). Needs Glimr's Resend key
 * and sender: without them, nobody is warned, so nobody is deleted either. `db` uses the
 * secret key.
 */
export async function runInactivity(
  db: SupabaseClient,
  send: (key: string, email: ServiceEmail) => Promise<SendResult> = sendResendEmail,
  now = new Date(),
): Promise<InactivityReport> {
  const report: InactivityReport = { warned: 0, deleted: 0, skipped: 0, failed: 0 }
  const { data, error } = await db.rpc('inactive_accounts_for_jobs')
  if (error) throw error
  const accounts = (data ?? []) as { user_id: string; email: string; action: 'warn' | 'delete' }[]
  if (!accounts.length) return report

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
  const today = now.toISOString().slice(0, 10)

  for (const account of accounts) {
    if (account.action === 'warn') {
      if (!key || !settings.data.email_from) {
        report.skipped++
        continue
      }
      const sent = await send(
        key,
        inactivityEmail(account, settings.data.email_from, settings.data.site_url, today),
      )
      if (!sent.ok) {
        report.failed++
        continue
      }
      const { error: noticeError } = await db
        .from('inactivity_notices')
        .insert({ user_id: account.user_id, warned_at: now.toISOString() })
      if (noticeError) throw noticeError
      report.warned++
      continue
    }
    // Owner of a workspace other people use: kept (no transfer of ownership yet).
    const { error: dataError } = await db.rpc('delete_account_data', {
      p_user_id: account.user_id,
    })
    if (dataError) {
      report.skipped++
      continue
    }
    const { error: authError } = await db.auth.admin.deleteUser(account.user_id)
    if (authError) throw authError
    report.deleted++
  }
  return report
}
