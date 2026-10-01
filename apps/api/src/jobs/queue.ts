import type { Env } from '../env'
import { adapters } from '../collect/adapters'
import { collect } from '../collect/collect'
import { supabaseCollectStore } from '../collect/store'
import { claudeDraftModel } from '../draft/model'
import { supabaseDraftStore } from '../draft/store'
import { draft } from '../draft/draft'
import { claudeTriageModel } from '../triage/model'
import { supabaseTriageStore } from '../triage/store'
import { triage } from '../triage/triage'
import { jobClient } from './client'

/**
 * Work sent by user requests (after an RLS access check) and run by the queue
 * consumer with the secret key. Queue consumers may run up to 15 minutes, unlike
 * waitUntil after a response, which is cut after 30 seconds.
 */
export type JobMessage =
  { type: 'collect-source'; sourceId: string } | { type: 'draft'; topicId: string; itemId: string }

export async function runJob(message: JobMessage, env: Env): Promise<void> {
  const db = jobClient(env)
  switch (message.type) {
    case 'collect-source': {
      // Collect now, then triage and draft what this run brought, for this topic only.
      const reports = await collect({
        store: supabaseCollectStore(db),
        adapters,
        onlySourceIds: [message.sourceId],
      })
      const topicId = reports[0]?.topic_id
      console.log(JSON.stringify({ job: 'collect-now', reports }))
      if (!topicId) return
      const triaged = await triage({
        store: supabaseTriageStore(db),
        model: claudeTriageModel,
        topicId,
      })
      const drafted = await draft({
        store: supabaseDraftStore(db),
        model: claudeDraftModel,
        topicId,
      })
      console.log(JSON.stringify({ job: 'triage-now', triaged, drafted }))
      return
    }
    case 'draft': {
      const report = await draft({
        store: supabaseDraftStore(db),
        model: claudeDraftModel,
        topicId: message.topicId,
        itemId: message.itemId,
        limit: 1,
      })
      console.log(JSON.stringify({ job: 'draft', item: message.itemId, report }))
      return
    }
  }
}

export async function consumeJobs(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      await runJob(message.body, env)
      message.ack()
    } catch (err) {
      console.error('job failed', message.body, err)
      message.retry()
    }
  }
}
