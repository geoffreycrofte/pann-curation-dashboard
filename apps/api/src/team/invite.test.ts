import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { ServiceEmail } from '../lib/resend'
import { joinedEmail, runInvitation } from './invite'

const INVITATION = {
  id: 'i1',
  email: 'b@example.org',
  invited_by: 'u1',
  workspace: { name: 'Atelier' },
}

/** A database with the calls the job makes, recording the updates. */
function fakeDb(outcome: 'joined' | 'invite' | 'gone') {
  const updates: unknown[] = []
  const chain = (data: unknown) => ({
    eq: () => ({ maybeSingle: async () => ({ data, error: null }) }),
    single: async () => ({
      data: { email_from: 'Glimr <support@example.org>', site_url: 'https://glimr.example' },
      error: null,
    }),
  })
  const db = {
    from: (table: string) => ({
      select: () => chain(table === 'workspace_invitations' ? INVITATION : null),
      update: (row: unknown) => ({
        eq: async () => {
          updates.push(row)
          return { error: null }
        },
      }),
    }),
    rpc: (name: string) => {
      if (name === 'process_invitation_for_jobs')
        return { single: async () => ({ data: { outcome }, error: null }) }
      if (name === 'user_langs_for_jobs')
        return Promise.resolve({ data: [{ email: 'b@example.org', lang: 'fr' }], error: null })
      if (name === 'platform_credentials_for_jobs')
        return Promise.resolve({ data: [{ provider: 'resend', secret: 're_x' }], error: null })
      throw new Error(name)
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { email: 'a@example.org', user_metadata: { lang: 'fr' } } },
          error: null,
        }),
      },
    },
  }
  return { db: db as unknown as SupabaseClient, updates }
}

describe('team invitations', () => {
  it('tells a person with an account that they joined', async () => {
    const { db } = fakeDb('joined')
    const sent: ServiceEmail[] = []
    const result = await runInvitation(db, 'i1', {
      send: async (_key, email) => {
        sent.push(email)
        return { ok: true, id: 'e1' }
      },
      invite: async () => ({ error: null }),
    })
    expect(result).toBe('joined')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toEqual(['b@example.org'])
    expect(sent[0]!.text).toContain('a@example.org vous a ajouté à son équipe')
    expect(sent[0]!.subject).toBe('Vous avez rejoint l’espace «\u00a0Atelier\u00a0» sur Glimr')
    expect(sent[0]!.html).not.toContain('lang="en"')
  })

  it('asks Supabase to invite a person without an account, back to the board', async () => {
    const { db } = fakeDb('invite')
    const invited: [string, string, string | null][] = []
    const result = await runInvitation(db, 'i1', {
      send: async () => ({ ok: true, id: 'e1' }),
      invite: async (email, redirectTo, lang) => {
        invited.push([email, redirectTo, lang])
        return { error: null }
      },
    })
    expect(result).toBe('invited')
    expect(invited).toEqual([['b@example.org', 'https://glimr.example', 'fr']])
  })

  it('records a failed account invitation as an error code', async () => {
    const { db, updates } = fakeDb('invite')
    const result = await runInvitation(db, 'i1', {
      send: async () => ({ ok: true, id: 'e1' }),
      invite: async () => ({ error: 'rate limit' }),
    })
    expect(result).toBe('failed')
    expect(updates[0]).toMatchObject({ error: 'invite_failed' })
  })

  it('escapes the workspace name in the e-mail', () => {
    const email = joinedEmail(
      { invitationId: 'i1', email: 'b@example.org', workspaceName: '<b>x</b>', inviter: null },
      'Glimr <support@example.org>',
      'https://glimr.example',
    )
    expect(email.html).not.toContain('<b>x</b>')
    expect(email.idempotencyKey).toBe('glimr-joined-i1')
  })
})
