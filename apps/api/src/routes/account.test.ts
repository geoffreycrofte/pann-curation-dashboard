import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { describe, expect, it } from 'vitest'
import type { AppEnv } from '../env'
import { account } from './account'
import { workspaces } from './workspaces'

const ME = 'u1'

/** Just enough of the Supabase client for these routes: one table, one answer. */
function fakeDb(rows: unknown) {
  const query = {
    select: () => query,
    update: () => query,
    eq: () => query,
    maybeSingle: () => Promise.resolve({ data: rows, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
  }
  return { from: () => query }
}

function mount(rows: unknown) {
  const sent: unknown[] = []
  const app = new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set('user', { id: ME, email: 'Ana@Example.org' })
      c.set('db', fakeDb(rows) as never)
      await next()
    })
    .route('/account', account)
    .route('/workspaces', workspaces)
    .onError((err, c) =>
      err instanceof HTTPException ? c.json({ error: err.message }, err.status) : c.json({}, 500),
    )
  const env = { JOBS: { send: async (m: unknown) => void sent.push(m) } }
  const call = (method: string, path: string, body: unknown) =>
    app.request(path, { method, body: JSON.stringify(body) }, env)
  return { call, sent }
}

describe('DELETE /account', () => {
  it('asks the email address as confirmation', async () => {
    const { call, sent } = mount([])
    const res = await call('DELETE', '/account', { confirm_email: 'other@example.org' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'confirmation_mismatch' })
    expect(sent).toEqual([])
  })

  it('refuses while the person owns a workspace other people use', async () => {
    const { call, sent } = mount([
      { workspace_id: 'w', user_id: ME, role: 'owner' },
      { workspace_id: 'w', user_id: 'u2', role: 'editor' },
    ])
    const res = await call('DELETE', '/account', { confirm_email: 'ana@example.org' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'workspace_has_members' })
    expect(sent).toEqual([])
  })

  it('queues the deletion of this user only', async () => {
    const { call, sent } = mount([
      { workspace_id: 'w', user_id: ME, role: 'owner' },
      { workspace_id: 'shared', user_id: ME, role: 'editor' },
      { workspace_id: 'shared', user_id: 'u3', role: 'owner' },
    ])
    const res = await call('DELETE', '/account', { confirm_email: ' ANA@example.org ' })
    expect(res.status).toBe(202)
    expect(sent).toEqual([{ type: 'delete-account', userId: ME }])
  })
})

describe('PATCH /workspaces/:id', () => {
  it('renames a workspace the user owns', async () => {
    const { call } = mount({ id: 'w', name: 'Crofte Studio' })
    const res = await call('PATCH', '/workspaces/w', { name: '  Crofte Studio ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'w', name: 'Crofte Studio' })
  })

  it('says owner only when RLS hides the update', async () => {
    const { call } = mount(null)
    const res = await call('PATCH', '/workspaces/w', { name: 'X' })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'owner_only' })
  })
})
