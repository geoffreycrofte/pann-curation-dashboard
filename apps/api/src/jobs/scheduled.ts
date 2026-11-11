import { adapters } from '../collect/adapters'
import { collect } from '../collect/collect'
import { supabaseCollectStore } from '../collect/store'
import { claudeDraftModel } from '../draft/model'
import { supabaseDraftStore } from '../draft/store'
import { draft } from '../draft/draft'
import { claudeEngagementModel } from '../engagement/model'
import { supabaseEngagementStore } from '../engagement/store'
import { triageConversations } from '../engagement/triage'
import type { Env } from '../env'
import { sendCampaign } from '../newsletter/send'
import { sendDigests } from '../newsletter/digest'
import { supabaseDigestStore } from '../newsletter/store'
import { publish } from '../publish/publish'
import { supabasePublishStore } from '../publish/store'
import { claudeTriageModel } from '../triage/model'
import { supabaseTriageStore } from '../triage/store'
import { triage } from '../triage/triage'
import { jobClient } from './client'
import { networks } from './queue'

/** Must match wrangler.jsonc triggers.crons. */
export const COLLECT_CRON = '7 * * * *'
/** Posts and newsletters go out within 5 minutes of their time. */
export const PUBLISH_CRON = '*/5 * * * *'

/**
 * Hourly: collect the due sources, triage what waits, catch up on pending drafts, then
 * judge the new conversations of the engagement tool.
 */
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
      const conversations = await triageConversations({
        store: supabaseEngagementStore(db),
        model: claudeEngagementModel,
      })
      console.log(JSON.stringify({ job: 'engagement-triage', report: conversations }))
      return
    }
    case PUBLISH_CRON: {
      const db = jobClient(env)
      const report = await publish({ store: supabasePublishStore(db), networks })
      if (report.sent || report.failed || report.retried)
        console.log(JSON.stringify({ job: 'publish', report }))
      // Newsletters whose weekly time has come (topics that send automatically).
      const digests = await sendDigests({
        store: supabaseDigestStore(db),
        send: sendCampaign,
        mode: 'scheduled',
      })
      if (digests.length) console.log(JSON.stringify({ job: 'digest', reports: digests }))
      return
    }
    default:
      console.warn(`No job bound to cron "${controller.cron}"`)
  }
}
