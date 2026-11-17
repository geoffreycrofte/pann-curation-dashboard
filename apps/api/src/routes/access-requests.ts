import { createClient } from '@supabase/supabase-js'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { parseJson } from '../lib/validation'

const requestBody = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  motivation: z.string().trim().min(20).max(2000),
  lang: z.enum(['fr', 'en']).default('fr'),
  /** Honeypot: hidden from people, filled by bots. Anything in it drops the request. */
  website: z.string().max(200).optional(),
})

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Public, without sign-in: a person without an account asks for access. The database
 * function stores it (publishable key, limits per address and per email), then a job
 * emails the admins. The answer is the same whatever happened, so that it never tells
 * whether an address already asked.
 */
export const accessRequests = new Hono<AppEnv>().post('/', async (c) => {
  const body = await parseJson(requestBody, c.req.raw)
  if (body.website) return c.json({ ok: true }, 202)

  const db = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const ip = c.req.header('CF-Connecting-IP')
  const { data: id, error } = await db.rpc('request_access', {
    p_name: body.name,
    p_email: body.email,
    p_motivation: body.motivation,
    p_lang: body.lang,
    p_ip_hash: ip ? await sha256(ip) : null,
  })
  if (error) throw error
  if (id)
    await c.env.JOBS.send({
      type: 'notify-access-request',
      requestId: id as string,
      origin: new URL(c.req.url).origin,
    })
  return c.json({ ok: true }, 202)
})
