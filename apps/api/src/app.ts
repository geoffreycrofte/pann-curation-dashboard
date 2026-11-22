import { createClient } from '@supabase/supabase-js'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from './env'
import { handleStripeWebhook } from './billing/billing'
import { jobClient } from './jobs/client'
import { requireUser } from './middleware/auth'
import { accessRequests } from './routes/access-requests'
import { account } from './routes/account'
import { admin } from './routes/admin'
import { credentials } from './routes/credentials'
import { me } from './routes/me'
import { sources } from './routes/sources'
import { diffusion } from './routes/diffusion'
import { newsletter } from './routes/newsletter'
import { onboarding } from './routes/onboarding'
import { compositions } from './routes/compositions'
import { voice } from './routes/voice'
import { series } from './routes/series'
import { zernioPlatform } from './routes/zernio-platform'
import { topics } from './routes/topics'
import { workspaces } from './routes/workspaces'

export const app = new Hono<AppEnv>().basePath('/api')

app.get('/health', (c) => c.json({ ok: true }))

// Without sign-in: the health check, and access requests (people without an account).
const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/access-requests',
  '/api/stripe/webhook',
  '/api/plans',
])
app.use('/*', async (c, next) => (PUBLIC_PATHS.has(c.req.path) ? next() : requireUser(c, next)))
app.route('/access-requests', accessRequests)
// The offers and their prices, for the pricing page (no sign-in, read with the public key).
app.get('/plans', async (c) => {
  const db = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db
    .from('plans')
    .select(
      'key, max_topics, max_social_accounts, monthly_tokens, price_month_eur, price_year_eur, trial_tokens',
    )
  if (error) throw error
  return c.json(data)
})

// Stripe calls it, not a person: the signature proves it, then the job client applies it.
app.post('/stripe/webhook', async (c) => {
  const result = await handleStripeWebhook(
    jobClient(c.env),
    await c.req.text(),
    c.req.header('stripe-signature') ?? null,
  )
  if (result.outcome !== 'ignored') console.log(JSON.stringify({ stripe: result.outcome }))
  return c.json({ received: result.status === 200, outcome: result.outcome }, result.status as 200)
})
app.route('/me', me)
app.route('/account', account)
app.route('/admin', admin)
app.route('/workspaces', workspaces)
app.route('/workspaces', zernioPlatform)
app.route('/onboarding', onboarding)
app.route('/topics', topics)
app.route('/topics', diffusion)
app.route('/topics', newsletter)
app.route('/topics', compositions)
app.route('/topics', voice)
app.route('/topics', series)
app.route('/topics/:topicId/sources', sources)
app.route('/workspaces/:workspaceId/credentials', credentials)

app.notFound((c) => c.json({ error: 'Not found' }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
  // Postgres check_violation raised by database guards (e.g. a forbidden status transition).
  if ((err as { code?: string }).code === '23514') return c.json({ error: err.message }, 409)
  console.error(err)
  return c.json({ error: 'Internal error' }, 500)
})
