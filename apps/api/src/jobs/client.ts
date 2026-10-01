import { createClient } from '@supabase/supabase-js'
import type { Env } from '../env'

/** Jobs use the secret key (service role): they bypass RLS and must stay idempotent. */
export function jobClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
