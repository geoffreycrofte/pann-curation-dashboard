import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from './env'
import { requireUser } from './middleware/auth'
import { credentials } from './routes/credentials'
import { me } from './routes/me'
import { sources } from './routes/sources'
import { topics } from './routes/topics'

export const app = new Hono<AppEnv>().basePath('/api')

app.get('/health', (c) => c.json({ ok: true }))

app.use('/*', async (c, next) => (c.req.path === '/api/health' ? next() : requireUser(c, next)))
app.route('/me', me)
app.route('/topics', topics)
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
