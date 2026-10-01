import { createClient } from '@supabase/supabase-js'
import { adapters } from '../collect/adapters'
import { collect } from '../collect/collect'
import { supabaseCollectStore } from '../collect/store'
import type { Env } from '../env'

/** Must match wrangler.jsonc triggers.crons. */
export const COLLECT_CRON = '7 * * * *'

/** Jobs use the secret key (service role): they bypass RLS and must stay idempotent. */
export function jobClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function runScheduled(controller: ScheduledController, env: Env): Promise<void> {
  switch (controller.cron) {
    case COLLECT_CRON: {
      const reports = await collect({ store: supabaseCollectStore(jobClient(env)), adapters })
      console.log(JSON.stringify({ job: 'collect', reports }))
      return
    }
    default:
      console.warn(`No job bound to cron "${controller.cron}"`)
  }
}

/** "Collect now" from the board, after the API checked the user can access the source. */
export async function collectSourceNow(env: Env, sourceId: string): Promise<void> {
  const reports = await collect({
    store: supabaseCollectStore(jobClient(env)),
    adapters,
    onlySourceIds: [sourceId],
  })
  console.log(JSON.stringify({ job: 'collect-now', reports }))
}
