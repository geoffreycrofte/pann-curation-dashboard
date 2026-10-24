import { createClient } from '@supabase/supabase-js'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../env'

/**
 * Verifies the Supabase access token (Authorization: Bearer …) and exposes
 * the user plus a Supabase client that carries the token, so RLS enforces tenancy.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token) throw new HTTPException(401, { message: 'Missing bearer token' })

  const db = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // getClaims verifies locally against the project's JWKS when asymmetric keys are
  // enabled, and falls back to the Auth server otherwise.
  const { data, error } = await db.auth.getClaims(token)
  if (error || !data?.claims.sub) throw new HTTPException(401, { message: 'Invalid token' })

  c.set('user', { id: data.claims.sub, email: data.claims.email })
  c.set('db', db)
  await next()
})
