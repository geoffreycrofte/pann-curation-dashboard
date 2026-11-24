import type { SupabaseClient } from '@supabase/supabase-js'
import {
  emailLangs,
  langsOf,
  renderEmail,
  type EmailContent,
  type EmailLang,
} from '../lib/email-layout'
import { sendResendEmail, type SendResult, type ServiceEmail } from '../lib/resend'

export interface JoinedNotice {
  invitationId: string
  email: string
  workspaceName: string
  inviter: string | null
}

/** E-mail to a person who already had an account and was added to a workspace. */
export function joinedEmail(
  notice: JoinedNotice,
  from: string,
  siteUrl: string,
  lang?: string | null,
): ServiceEmail {
  const link = `${siteUrl}/`
  const contents: Record<EmailLang, EmailContent> = {
    fr: {
      subject: `Vous avez rejoint l’espace « ${notice.workspaceName} » sur Glimr`,
      heading: `Bienvenue dans l’espace « ${notice.workspaceName} »`,
      paragraphs: [
        `${notice.inviter ?? 'Le propriétaire de l’espace'} vous a ajouté à son équipe sur Glimr. Vous travaillez désormais sur tous les thèmes de cet espace.`,
        'Choisissez l’espace en haut du menu pour voir ses thèmes.',
      ],
      button: { label: 'Ouvrir Glimr', url: link },
    },
    en: {
      subject: `You joined the “${notice.workspaceName}” workspace on Glimr`,
      heading: `Welcome to the “${notice.workspaceName}” workspace`,
      paragraphs: [
        `${notice.inviter ?? 'The owner of the workspace'} added you to their team on Glimr. You now work on every topic of this workspace.`,
        'Pick the workspace at the top of the menu to see its topics.',
      ],
      button: { label: 'Open Glimr', url: link },
    },
  }
  const email = renderEmail(
    siteUrl,
    Object.fromEntries(emailLangs(lang).map((l) => [l, contents[l]])),
  )
  return {
    from,
    to: [notice.email],
    ...email,
    idempotencyKey: `glimr-joined-${notice.invitationId}`,
  }
}

export interface InviteDeps {
  send: (key: string, email: ServiceEmail) => Promise<SendResult>
  /**
   * Supabase's account invitation (secret key), back to the board. The language (the
   * inviter's) goes in the new account's metadata: Supabase's template is written in it.
   */
  invite: (
    email: string,
    redirectTo: string,
    lang: string | null,
  ) => Promise<{ error: string | null }>
}

const supabaseDeps = (db: SupabaseClient): InviteDeps => ({
  send: sendResendEmail,
  async invite(email, redirectTo, lang) {
    const { error } = await db.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      ...(lang ? { data: { lang } } : {}),
    })
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

  // The inviter: named in the e-mail; their language for a person not known yet.
  let inviter: { email: string | null; lang: string | null } = { email: null, lang: null }
  if (inv.invited_by) {
    const { data: user } = await db.auth.admin.getUserById(inv.invited_by)
    const lang = user.user?.user_metadata?.lang
    inviter = {
      email: user.user?.email ?? null,
      lang: lang === 'fr' || lang === 'en' ? lang : null,
    }
  }

  if (data.outcome === 'invite') {
    const result = await deps.invite(inv.email, settings.data.site_url, inviter.lang)
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
  const result = await deps.send(
    key,
    joinedEmail(
      {
        invitationId,
        email: inv.email,
        workspaceName: inv.workspace?.name ?? '',
        inviter: inviter.email,
      },
      settings.data.email_from,
      settings.data.site_url,
      (await langsOf(db, [inv.email])).get(inv.email),
    ),
  )
  if (!result.ok && result.retry) throw new Error(result.error)
  return 'joined'
}
