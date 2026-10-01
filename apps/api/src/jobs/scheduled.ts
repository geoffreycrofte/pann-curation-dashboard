import { createClient } from '@supabase/supabase-js'
import { adapters } from '../collect/adapters'
import { collect } from '../collect/collect'
import { supabaseCollectStore } from '../collect/store'
import type { Env } from '../env'

/** Must match wrangler.jsonc triggers.crons. */
export const COLLECT_CRON = '7 * * * *'

/** Jobs use the secret key (service role): they bypass RLS and must stay idempotent. */
function jobClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function runScheduled(controller: ScheduledController, env: Env): Promise<void> {
  switch (controller.cron) {
    case COLLECT_CRON: {
      const reports = await collect({
        store: supabaseCollectStore(jobClient(env)),
        adapters,
        secrets: { EXA_API_KEY: env.EXA_API_KEY, GITHUB_TOKEN: env.GITHUB_TOKEN },
      })
      console.log(JSON.stringify({ job: 'collect', reports }))
      return
    }
    default:
      console.warn(`No job bound to cron "${controller.cron}"`)
  }
}
