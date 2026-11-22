import type { Env } from '../env'
import { adapters } from '../collect/adapters'
import { collect } from '../collect/collect'
import { supabaseCollectStore } from '../collect/store'
import { claudeDraftModel } from '../draft/model'
import { supabaseDraftStore } from '../draft/store'
import { draft } from '../draft/draft'
import { claudeEngagementModel } from '../engagement/model'
import { supabaseEngagementStore } from '../engagement/store'
import { runBillingRequest } from '../billing/billing'
import { runReplyDraft } from '../engagement/reply'
import { triageConversations } from '../engagement/triage'
import type { Lang } from '@pann/shared'
import { sendDigests } from '../newsletter/digest'
import { sendCampaign } from '../newsletter/send'
import { refreshNewsletterAccount, supabaseDigestStore } from '../newsletter/store'
import { publishToBluesky, publishToDiscord } from '../publish/direct'
import { publishWithZernio, publishToMastodon } from '../publish/networks'
import { publish } from '../publish/publish'
import { refreshZernioAccounts, supabasePublishStore } from '../publish/store'
import { claudeRewriteModel, runRewrite } from '../rewrite/rewrite'
import { claudeTriageModel } from '../triage/model'
import { supabaseTriageStore } from '../triage/store'
import { triage } from '../triage/triage'
import { jobClient } from './client'
import { notifyAccessRequest } from '../access/notify'
import { runOnboarding } from '../onboarding/assistant'
import { runVoiceAnalysis } from '../voice/analyze'
import { runSeriesPlan } from '../series/plan'
import { runZernioPlatform } from '../publish/platform'
import { claudeComposeModel } from '../compose/model'
import {
  runComposeDraft,
  runComposeResearch,
  runDescribeMedia,
  type ComposeDeps,
} from '../compose/jobs'
import { exaSearch, fetchSourceText, supabaseComposeStore } from '../compose/store'

/**
 * Work sent by user requests (after an RLS access check) and run by the queue
 * consumer with the secret key. Queue consumers may run up to 15 minutes, unlike
 * waitUntil after a response, which is cut after 30 seconds.
 */
export type JobMessage =
  | { type: 'collect-source'; sourceId: string }
  | { type: 'draft'; topicId: string; itemId: string }
  /** Publish what is due now (after "publish now", or a retry). */
  | { type: 'publish' }
  | {
      type: 'refresh-credential'
      workspaceId: string
      provider: 'zernio' | 'brevo' | 'sendfox'
    }
  /** Newsletter sent from the board, for one topic (all its languages, or one). */
  | { type: 'send-digest'; topicId: string; lang?: Lang }
  /** Account deletion, asked from the Profile page by the user themself. */
  | { type: 'delete-account'; userId: string }
  /** AI rewrite of a summary or post, asked from the item page (table rewrites). */
  | { type: 'rewrite'; rewriteId: string }
  /** Emails the platform admins about an access request (Resend, Pann's key). */
  | { type: 'notify-access-request'; requestId: string; origin: string }
  /** Next answer of the onboarding assistant (Pann's key, onboarding credit). */
  | { type: 'onboarding'; sessionId: string }
  /** Création: search sources, write the posts, propose the text alternatives of an image. */
  | { type: 'compose-research'; compositionId: string }
  | { type: 'compose-draft'; compositionId: string }
  | { type: 'describe-media'; mediaId: string }
  /** Voice rules proposed from past posts (Settings, voice). */
  | { type: 'analyze-voice'; analysisId: string }
  /** Plan of a series of posts (Création). */
  | { type: 'plan-series'; seriesId: string }
  /** Payment: opens the Stripe page asked from the board (table billing_requests). */
  | { type: 'billing'; requestId: string }
  /** Reply to a conversation, drafted on request (the person posts it themself). */
  | { type: 'engagement-reply'; topicId: string; itemId: string }
  /** Zernio in platform mode: a connection link, or the accounts listed again. */
  | { type: 'zernio-platform'; workspaceId: string }

export const networks = {
  zernio: publishWithZernio,
  mastodon: publishToMastodon,
  bluesky: publishToBluesky,
  discord: publishToDiscord,
}

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
      if (reports[0]?.module === 'engagement') {
        const judged = await triageConversations({
          store: supabaseEngagementStore(db),
          model: claudeEngagementModel,
          topicId,
        })
        console.log(JSON.stringify({ job: 'engagement-triage-now', judged }))
        return
      }
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
    case 'publish': {
      const report = await publish({ store: supabasePublishStore(db), networks })
      console.log(JSON.stringify({ job: 'publish-now', report }))
      return
    }
    case 'refresh-credential': {
      if (message.provider === 'zernio') await refreshZernioAccounts(db, message.workspaceId)
      else await refreshNewsletterAccount(db, message.workspaceId, message.provider)
      return
    }
    case 'delete-account': {
      // Data first (idempotent), then the auth user: a retry finishes the job.
      const { data, error } = await db.rpc('delete_account_data', { p_user_id: message.userId })
      if (error?.message.includes('workspace_has_members')) {
        // A member joined since the request: nothing is deleted.
        console.warn(JSON.stringify({ job: 'delete-account', refused: 'workspace_has_members' }))
        return
      }
      if (error) throw error
      const { error: authError } = await db.auth.admin.deleteUser(message.userId)
      if (authError) throw authError
      console.log(JSON.stringify({ job: 'delete-account', result: data }))
      return
    }
    case 'notify-access-request': {
      const result = await notifyAccessRequest(db, message.requestId, message.origin)
      console.log(JSON.stringify({ job: 'notify-access-request', result }))
      return
    }
    case 'compose-research':
    case 'compose-draft':
    case 'describe-media': {
      const deps: ComposeDeps = {
        store: supabaseComposeStore(db),
        model: claudeComposeModel,
        fetchSource: fetchSourceText,
        search: exaSearch,
      }
      const result =
        message.type === 'compose-research'
          ? await runComposeResearch(deps, message.compositionId)
          : message.type === 'compose-draft'
            ? await runComposeDraft(deps, message.compositionId)
            : await runDescribeMedia(deps, message.mediaId)
      console.log(JSON.stringify({ job: message.type, result }))
      return
    }
    case 'zernio-platform': {
      const result = await runZernioPlatform(db, message.workspaceId)
      console.log(JSON.stringify({ job: 'zernio-platform', result }))
      return
    }
    case 'plan-series': {
      const result = await runSeriesPlan(db, message.seriesId, claudeComposeModel)
      console.log(JSON.stringify({ job: 'plan-series', result }))
      return
    }
    case 'analyze-voice': {
      const result = await runVoiceAnalysis(db, message.analysisId, claudeComposeModel)
      console.log(JSON.stringify({ job: 'analyze-voice', result }))
      return
    }
    case 'onboarding': {
      const result = await runOnboarding(db, message.sessionId)
      console.log(JSON.stringify({ job: 'onboarding', result }))
      return
    }
    case 'rewrite': {
      await runRewrite(db, message.rewriteId, claudeRewriteModel)
      return
    }
    case 'billing': {
      await runBillingRequest(db, message.requestId)
      return
    }
    case 'engagement-reply': {
      await runReplyDraft(db, message.topicId, message.itemId, claudeRewriteModel)
      return
    }
    case 'send-digest': {
      const reports = await sendDigests({
        store: supabaseDigestStore(db),
        send: sendCampaign,
        mode: 'now',
        topicId: message.topicId,
        langs: message.lang ? [message.lang] : undefined,
      })
      console.log(JSON.stringify({ job: 'send-digest', reports }))
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
