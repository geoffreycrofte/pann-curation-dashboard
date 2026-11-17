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

  it('keeps the admin space behind authentication', async () => {
    const res = await app.request('/api/admin/credentials', {}, env)
    expect(res.status).toBe(401)
  })

  it('takes access requests without sign-in, and drops what bots fill in', async () => {
    const post = (body: unknown) =>
      app.request(
        '/api/access-requests',
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        },
        env,
      )
    // The honeypot answers like a real request, without touching the database.
    const bot = await post({
      name: 'Bot',
      email: 'bot@example.org',
      motivation: 'x'.repeat(30),
      website: 'https://spam.example',
    })
    expect(bot.status).toBe(202)
    expect((await post({ name: 'A', email: 'not an email', motivation: 'short' })).status).toBe(400)
  })
})
