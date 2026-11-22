import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectUrl, ensureProfile, runZernioPlatform } from './platform'

afterEach(() => vi.unstubAllGlobals())

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return handler(url, init)
  })
  return calls
}

describe('Zernio profiles', () => {
  it('finds the workspace’s profile by its externalId', async () => {
    const calls = stubFetch(() => Response.json({ profiles: [{ _id: 'p1' }] }))
    expect(await ensureProfile('k', 'ws-1')).toEqual({ ok: true, id: 'p1' })
    expect(calls[0]!.url).toBe('https://zernio.com/api/v1/profiles?externalId=ws-1')
    expect(calls).toHaveLength(1)
  })

  it('creates it once (idempotency key), or takes the one created meanwhile', async () => {
    const calls = stubFetch((url, init) =>
      init.method === 'POST'
        ? Response.json({ profile: { _id: 'p2' } }, { status: 201 })
        : Response.json({ profiles: [] }),
    )
    expect(await ensureProfile('k', 'ws-1')).toEqual({ ok: true, id: 'p2' })
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({
      name: 'Glimr ws-1',
      externalId: 'ws-1',
    })
    expect((calls[1]!.init.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'glimr-profile-ws-1',
    )

    stubFetch((url, init) =>
      init.method === 'POST'
        ? Response.json({ details: { existingProfileId: 'p3' } }, { status: 409 })
        : Response.json({ profiles: [] }),
    )
    expect(await ensureProfile('k', 'ws-1')).toEqual({ ok: true, id: 'p3' })
  })

  it('asks for posting and comments, with Glimr’s welcome screen', async () => {
    const calls = stubFetch(() => Response.json({ authUrl: 'https://www.linkedin.com/oauth/x' }))
    expect(
      await connectUrl('k', 'linkedin', 'p1', 'https://glimr.example/connections?zernio=connected'),
    ).toEqual({
      ok: true,
      url: 'https://www.linkedin.com/oauth/x',
    })
    const url = new URL(calls[0]!.url)
    expect(url.pathname).toBe('/api/v1/connect/linkedin')
    expect(url.searchParams.get('profileId')).toBe('p1')
    expect(url.searchParams.get('scopes')).toBe('posting,comments')
    expect(url.searchParams.get('brandName')).toBe('Glimr')
  })
})

describe('runZernioPlatform', () => {
  function fakeDb(link: Record<string, unknown>, key: string | null = 'glimr_key') {
    const updates: Record<string, unknown>[] = []
    const ok = <T>(data: T) => Promise.resolve({ data, error: null })
    const db = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => ok(link) }) }),
        update: (fields: Record<string, unknown>) => ({
          eq: () => (updates.push(fields), ok(null)),
        }),
      }),
      rpc: () => ok(key ? [{ provider: 'zernio', secret: key }] : []),
    } as unknown as SupabaseClient
    return { db, updates }
  }
  const base = {
    workspace_id: 'ws-1',
    enabled: true,
    status: 'pending',
    redirect_url: 'https://glimr.example/connections?zernio=connected',
  }

  it('creates the profile if needed, then prepares the connection link', async () => {
    stubFetch((url, init) =>
      url.includes('/connect/')
        ? Response.json({ authUrl: 'https://www.facebook.com/dialog/oauth' })
        : init.method === 'POST'
          ? Response.json({ profile: { _id: 'p9' } }, { status: 201 })
          : Response.json({ profiles: [] }),
    )
    const { db, updates } = fakeDb({ ...base, profile_id: null, connect_platform: 'facebook' })
    expect(await runZernioPlatform(db, 'ws-1')).toBe('link_ready')
    expect(updates[0]).toMatchObject({ profile_id: 'p9' })
    expect(updates[1]).toMatchObject({
      status: 'idle',
      connect_url: 'https://www.facebook.com/dialog/oauth',
    })
  })

  it('lists the accounts of the profile only', async () => {
    const calls = stubFetch(() =>
      Response.json({ accounts: [{ _id: 'a1', platform: 'linkedin', username: 'acme' }] }),
    )
    const { db, updates } = fakeDb({ ...base, profile_id: 'p1', connect_platform: null })
    expect(await runZernioPlatform(db, 'ws-1')).toBe('refreshed')
    expect(calls[0]!.url).toBe('https://zernio.com/api/v1/accounts?profileId=p1')
    expect(updates[0]).toMatchObject({
      status: 'idle',
      accounts: [{ id: 'a1', platform: 'linkedin', username: 'acme', active: true }],
    })
  })

  it('does nothing for a workspace not in platform mode, and fails without Glimr’s key', async () => {
    expect(await runZernioPlatform(fakeDb({ ...base, enabled: false }).db, 'ws-1')).toBe('skipped')
    const { db, updates } = fakeDb({ ...base, profile_id: 'p1', connect_platform: null }, null)
    expect(await runZernioPlatform(db, 'ws-1')).toBe('no_key')
    expect(updates[0]).toMatchObject({ status: 'failed', error: 'missing_credential:zernio' })
  })
})
