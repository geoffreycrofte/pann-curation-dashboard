import { describe, expect, it } from 'vitest'
import { app } from './app'

const env = { SUPABASE_URL: 'http://localhost', SUPABASE_PUBLISHABLE_KEY: 'x' }

describe('api', () => {
  it('answers the health check without auth', async () => {
    const res = await app.request('/api/health', {}, env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('rejects requests without a bearer token', async () => {
    const res = await app.request('/api/topics', {}, env)
    expect(res.status).toBe(401)
  })
})
