import { createClient } from '@supabase/supabase-js'
import { adapters } from '../collect/adapters'
import { collect } from '../collect/collect'
import { supabaseCollectStore } from '../collect/store'
import type { Env } from '../env'
import { claudeTriageModel } from '../triage/model'
import { supabaseTriageStore } from '../triage/store'
import { triage } from '../triage/triage'

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
      const db = jobClient(env)
      const reports = await collect({ store: supabaseCollectStore(db), adapters })
      console.log(JSON.stringify({ job: 'collect', reports }))
      // Triage whatever is waiting, new items included.
      const triaged = await triage({ store: supabaseTriageStore(db), model: claudeTriageModel })
      console.log(JSON.stringify({ job: 'triage', report: triaged }))
      return
    }
    default:
      console.warn(`No job bound to cron "${controller.cron}"`)
  }
}

/**
 * "Collect now" from the board, after the API checked the user can access the source:
 * collects the source, then triages the new items of its topic right away.
 */
export async function collectSourceNow(env: Env, sourceId: string): Promise<void> {
  const db = jobClient(env)
  const reports = await collect({
    store: supabaseCollectStore(db),
    adapters,
    onlySourceIds: [sourceId],
  })
  console.log(JSON.stringify({ job: 'collect-now', reports }))
  const topicId = reports[0]?.topic_id
  if (!topicId) return
  const triaged = await triage({
    store: supabaseTriageStore(db),
    model: claudeTriageModel,
    topicId,
  })
  console.log(JSON.stringify({ job: 'triage-now', report: triaged }))
}
