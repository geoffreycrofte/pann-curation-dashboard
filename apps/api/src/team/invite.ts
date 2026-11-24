import { escapeHtml } from '@glimr/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendResendEmail, type SendResult, type ServiceEmail } from '../lib/resend'

export interface JoinedNotice {
  invitationId: string
  email: string
  workspaceName: string
  inviter: string | null
}

/**
 * E-mail to a person who already had an account and was added to a workspace. In French and
 * in English: the interface language is kept in the browser, not here.
 */
export function joinedEmail(notice: JoinedNotice, from: string, siteUrl: string): ServiceEmail {
  const link = `${siteUrl}/`
  const who = notice.inviter ?? 'Glimr'
  const fr = [
    `${who} vous a ajouté à l’espace « ${notice.workspaceName} » sur Glimr.`,
    'Ses thèmes apparaissent dans le choix de l’espace, en haut du menu :',
  ]
  const en = [
    `${who} added you to the “${notice.workspaceName}” workspace on Glimr.`,
    'Its topics show once you pick the workspace, at the top of the menu:',
  ]
  const block = (lang: string, lines: string[]) =>
    `<div lang="${lang}">${lines.map((l) => `<p style="margin:0 0 12px;">${escapeHtml(l)}</p>`).join('')}<p style="margin:0 0 24px;"><a href="${escapeHtml(link)}" style="color:#5c4300;">${escapeHtml(link)}</a></p></div>`
  return {
    from,
    to: [notice.email],
    subject: `Espace « ${notice.workspaceName} » sur Glimr / “${notice.workspaceName}” workspace on Glimr`,
    text: [...fr, link, '', '---', '', ...en, link].join('\n\n'),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#141414;">${block('fr', fr)}<hr style="border:0;border-top:1px solid #ddd;margin:24px 0;">${block('en', en)}</div>`,
    idempotencyKey: `glimr-joined-${notice.invitationId}`,
  }
}

export interface InviteDeps {
  send: (key: string, email: ServiceEmail) => Promise<SendResult>
  /** Supabase's account invitation (secret key), back to the board. */
  invite: (email: string, redirectTo: string) => Promise<{ error: string | null }>
}

const supabaseDeps = (db: SupabaseClient): InviteDeps => ({
  send: sendResendEmail,
  async invite(email, redirectTo) {
    const { error } = await db.auth.admin.inviteUserByEmail(email, { redirectTo })
    return { error: error?.message ?? null }
  },
})

/**
 * Job: an invitation sent from the Team tab. A person with an account joins at once and gets
 * an e-mail (when Glimr's Resend key is set); a person without one gets Supabase's account
 * invitation, and joins on their first sign-in (private.handle_new_user). `db` uses the
 * secret key.
 */
export async function runInvitation(
  db: SupabaseClient,
  invitationId: string,
  deps: InviteDeps = supabaseDeps(db),
): Promise<'joined' | 'invited' | 'failed' | 'skipped'> {
  const [invitation, settings] = await Promise.all([
    db
      .from('workspace_invitations')
      .select('id, email, invited_by, workspace:workspaces (name)')
      .eq('id', invitationId)
      .maybeSingle<{
        id: string
        email: string
        invited_by: string | null
        workspace: { name: string } | null
      }>(),
    db
      .from('platform_settings')
      .select('email_from, site_url')
      .single<{ email_from: string; site_url: string }>(),
  ])
  if (invitation.error) throw invitation.error
  if (settings.error) throw settings.error
  if (!invitation.data) return 'skipped'
  const inv = invitation.data

  const { data, error } = await db
    .rpc('process_invitation_for_jobs', { p_invitation_id: invitationId })
    .single<{ outcome: 'joined' | 'invite' | 'gone' }>()
  if (error) throw error
  if (data.outcome === 'gone') return 'skipped'

  if (data.outcome === 'invite') {
    const result = await deps.invite(inv.email, settings.data.site_url)
    if (result.error) {
      const { error: updateError } = await db
        .from('workspace_invitations')
        .update({ error: 'invite_failed', processed_at: new Date().toISOString() })
        .eq('id', invitationId)
      if (updateError) throw updateError
      return 'failed'
    }
    // Supabase created the account: the invitation became a membership (or waits, if the
    // workspace filled up meanwhile).
    await db
      .from('workspace_invitations')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', invitationId)
    return 'invited'
  }

  // Joined: tell the person, when Glimr can send e-mails.
  const keys = await db.rpc('platform_credentials_for_jobs')
  if (keys.error) throw keys.error
  const key = ((keys.data ?? []) as { provider: string; secret: string }[]).find(
    (k) => k.provider === 'resend',
  )?.secret
  if (!key || !settings.data.email_from) return 'joined'
  let inviter: string | null = null
  if (inv.invited_by) {
    const { data: user } = await db.auth.admin.getUserById(inv.invited_by)
    inviter = user.user?.email ?? null
  }
  const result = await deps.send(
    key,
    joinedEmail(
      {
        invitationId,
        email: inv.email,
        workspaceName: inv.workspace?.name ?? '',
        inviter,
      },
      settings.data.email_from,
      settings.data.site_url,
    ),
  )
  if (!result.ok && result.retry) throw new Error(result.error)
  return 'joined'
}
