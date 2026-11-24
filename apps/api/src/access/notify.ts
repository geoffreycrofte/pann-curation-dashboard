import type { SupabaseClient } from '@supabase/supabase-js'
import { renderEmail } from '../lib/email-layout'
import { sendResendEmail, type SendResult, type ServiceEmail } from '../lib/resend'

export interface AccessRequest {
  id: string
  name: string
  email: string
  motivation: string
  lang: string
  created_at: string
}

/**
 * Email to the platform admins about a new access request. Written for the admin of
 * Glimr, in French: it is an internal notification, not a text of the product.
 */
export function accessRequestEmail(
  request: AccessRequest,
  from: string,
  to: string[],
  adminUrl: string,
): ServiceEmail {
  const email = renderEmail(new URL(adminUrl).origin, {
    fr: {
      subject: `Demande d’accès à Glimr : ${request.name}`,
      heading: `Demande d’accès : ${request.name}`,
      paragraphs: [
        `${request.name} <${request.email}> demande un accès à Glimr. Sa motivation :`,
        ...request.motivation.split(/\n{2,}/),
        `Langue de l’interface : ${request.lang}`,
      ],
      button: { label: 'Voir les demandes d’accès', url: adminUrl },
      note: 'Répondre à cet e-mail écrit directement à la personne.',
    },
  })
  return {
    from,
    to,
    ...email,
    replyTo: request.email,
    idempotencyKey: `glimr-access-request-${request.id}`,
  }
}

/**
 * Job: notifies the platform admins of an access request. Needs Glimr's Resend key and a
 * sender (admin space); without them the request stays listed, with the reason.
 * `db` uses the secret key.
 */
export async function notifyAccessRequest(
  db: SupabaseClient,
  requestId: string,
  origin: string,
  send: (key: string, email: ServiceEmail) => Promise<SendResult> = sendResendEmail,
): Promise<'sent' | 'skipped' | 'failed'> {
  const [request, keys, settings, admins] = await Promise.all([
    db
      .from('access_requests')
      .select('id, name, email, motivation, lang, created_at, notified_at')
      .eq('id', requestId)
      .maybeSingle<AccessRequest & { notified_at: string | null }>(),
    db.rpc('platform_credentials_for_jobs'),
    db.from('platform_settings').select('email_from').single<{ email_from: string }>(),
    db.rpc('platform_admin_emails'),
  ])
  if (request.error) throw request.error
  if (!request.data || request.data.notified_at) return 'skipped'
  if (keys.error) throw keys.error
  if (settings.error) throw settings.error
  if (admins.error) throw admins.error

  const key = ((keys.data ?? []) as { provider: string; secret: string }[]).find(
    (k) => k.provider === 'resend',
  )?.secret
  const to = ((admins.data ?? []) as { email: string }[]).map((a) => a.email)
  const fail = async (error: string) => {
    const { error: updateError } = await db
      .from('access_requests')
      .update({ notify_error: error })
      .eq('id', requestId)
    if (updateError) throw updateError
    return 'failed' as const
  }
  if (!key) return fail('missing_credential:resend')
  if (!settings.data.email_from) return fail('email_sender_missing')
  if (!to.length) return fail('no_platform_admin')

  const result = await send(
    key,
    accessRequestEmail(request.data, settings.data.email_from, to, `${origin}/admin`),
  )
  if (!result.ok) {
    if (result.retry) throw new Error(result.error)
    return fail(result.error)
  }
  const { error } = await db
    .from('access_requests')
    .update({ notified_at: new Date().toISOString(), notify_error: null })
    .eq('id', requestId)
  if (error) throw error
  return 'sent'
}
