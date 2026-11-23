import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { inactivityEmail, runInactivity } from './inactivity'

/** A database with the calls the job makes, recording what it does. */
function fakeDb(accounts: { user_id: string; email: string; action: string }[], resend = true) {
  const calls = {
    notices: [] as unknown[],
    deletedData: [] as string[],
    deletedUsers: [] as string[],
  }
  const db = {
    rpc: async (name: string, args?: { p_user_id: string }) => {
      if (name === 'inactive_accounts_for_jobs') return { data: accounts, error: null }
      if (name === 'platform_credentials_for_jobs')
        return { data: resend ? [{ provider: 'resend', secret: 're_x' }] : [], error: null }
      if (name === 'delete_account_data') {
        if (args!.p_user_id === 'shared')
          return { data: null, error: { message: 'workspace_has_members' } }
        calls.deletedData.push(args!.p_user_id)
        return { data: {}, error: null }
      }
      throw new Error(name)
    },
    from: (table: string) => ({
      select: () => ({
        single: async () => ({
          data: { email_from: 'Glimr <support@example.org>', site_url: 'https://glimr.example' },
          error: null,
        }),
      }),
      insert: async (row: unknown) => {
        if (table === 'inactivity_notices') calls.notices.push(row)
        return { error: null }
      },
    }),
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          calls.deletedUsers.push(id)
          return { error: null }
        },
      },
    },
  }
  return { db: db as unknown as SupabaseClient, calls }
}

const ok = async () => ({ ok: true as const, id: 'e1' })

describe('inactive accounts', () => {
  it('warns, records the warning, and deletes the accounts warned a month ago', async () => {
    const { db, calls } = fakeDb([
      { user_id: 'u1', email: 'a@example.org', action: 'warn' },
      { user_id: 'u2', email: 'b@example.org', action: 'delete' },
    ])
    const report = await runInactivity(db, ok, new Date('2026-12-01T03:00:00Z'))
    expect(report).toEqual({ warned: 1, deleted: 1, skipped: 0, failed: 0 })
    expect(calls.notices).toEqual([{ user_id: 'u1', warned_at: '2026-12-01T03:00:00.000Z' }])
    expect(calls.deletedUsers).toEqual(['u2'])
  })

  it('warns nobody without Glimr’s e-mail key, and keeps an owner others work with', async () => {
    const { db, calls } = fakeDb(
      [
        { user_id: 'u1', email: 'a@example.org', action: 'warn' },
        { user_id: 'shared', email: 'c@example.org', action: 'delete' },
      ],
      false,
    )
    const report = await runInactivity(db, ok)
    expect(report).toEqual({ warned: 0, deleted: 0, skipped: 2, failed: 0 })
    expect(calls.notices).toEqual([])
    expect(calls.deletedUsers).toEqual([])
  })

  it('records no warning when the e-mail fails', async () => {
    const { db, calls } = fakeDb([{ user_id: 'u1', email: 'a@example.org', action: 'warn' }])
    const fail = async () => ({ ok: false as const, error: 'provider_error:resend', retry: true })
    expect((await runInactivity(db, fail)).failed).toBe(1)
    expect(calls.notices).toEqual([])
  })

  it('links to the sign-in page, in French and in English, once a day', () => {
    const email = inactivityEmail(
      { user_id: 'u1', email: 'a@example.org' },
      'Glimr <support@example.org>',
      'https://glimr.example',
      '2026-12-01',
    )
    expect(email.text).toContain('https://glimr.example/login')
    expect(email.html).toContain('lang="fr"')
    expect(email.html).toContain('lang="en"')
    expect(email.idempotencyKey).toBe('glimr-inactivity-u1-2026-12-01')
  })
})
