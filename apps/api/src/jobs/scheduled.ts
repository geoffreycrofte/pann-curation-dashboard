import { adapters } from '../collect/adapters'
import { collect } from '../collect/collect'
import { supabaseCollectStore } from '../collect/store'
import { claudeDraftModel } from '../draft/model'
import { supabaseDraftStore } from '../draft/store'
import { draft } from '../draft/draft'
import type { Env } from '../env'
import { claudeTriageModel } from '../triage/model'
import { supabaseTriageStore } from '../triage/store'
import { triage } from '../triage/triage'
import { jobClient } from './client'

/** Must match wrangler.jsonc triggers.crons. */
export const COLLECT_CRON = '7 * * * *'

/** Hourly: collect the due sources, triage what waits, catch up on pending drafts. */
export async function runScheduled(controller: ScheduledController, env: Env): Promise<void> {
  switch (controller.cron) {
    case COLLECT_CRON: {
      const db = jobClient(env)
      const reports = await collect({ store: supabaseCollectStore(db), adapters })
      console.log(JSON.stringify({ job: 'collect', reports }))
      const triaged = await triage({ store: supabaseTriageStore(db), model: claudeTriageModel })
      console.log(JSON.stringify({ job: 'triage', report: triaged }))
      const drafted = await draft({ store: supabaseDraftStore(db), model: claudeDraftModel })
      console.log(JSON.stringify({ job: 'draft', report: drafted }))
      return
    }
    default:
      console.warn(`No job bound to cron "${controller.cron}"`)
  }
}
