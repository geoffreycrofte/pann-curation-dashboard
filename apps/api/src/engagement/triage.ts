import {
  claudeCostUsd,
  type EngagementDecision,
  type EngagementRisk,
  type TopicConfig,
} from '@pann/shared'
import type { UsageEntry } from '../collect/types'
import type { EngagementModel } from './model'
import {
  ENGAGEMENT_PROMPT_VERSION,
  engagementSystemPrompt,
  engagementUserMessage,
  type EngagementItem,
} from './prompt'

/** Conversations waiting for the engagement triage. */
export interface PendingConversation extends EngagementItem {
  item_id: string
  topic_id: string
  workspace_id: string
  topic_name_en: string
  topic_config: TopicConfig
  source_lang: string | null
  triage_attempts: number
}

export interface EngagementDecisionRecord {
  opportunity: number
  decision: EngagementDecision
  angle: string | null
  risk: EngagementRisk
  reason: string
  language: string
  /** Below the threshold, or skipped: archived, out of the list but still searchable. */
  archived: boolean
}

export interface EngagementStore {
  pending(options: { limit: number; topicId?: string }): Promise<PendingConversation[]>
  anthropicKey(workspaceId: string): Promise<string | undefined>
  markCredentialInvalid(workspaceId: string): Promise<void>
  saveDecision(item: PendingConversation, decision: EngagementDecisionRecord): Promise<void>
  saveFailure(item: PendingConversation, error: string): Promise<void>
  logUsage(item: PendingConversation, usage: UsageEntry): Promise<void>
}

export const MAX_ENGAGEMENT_ATTEMPTS = 3
export const MAX_ENGAGEMENT_PER_RUN = 25

export interface EngagementReport {
  triaged: number
  archived: number
  failed: number
  skipped_no_key: number
}

export function decideEngagement(
  output: {
    opportunity: number
    decision: EngagementDecision
    angle: string
    risk: EngagementRisk
    reason: string
    language: string
  },
  config: TopicConfig,
): EngagementDecisionRecord {
  const opportunity = Math.max(0, Math.min(100, Math.round(output.opportunity)))
  const angle = output.angle.trim().slice(0, 500)
  return {
    opportunity,
    decision: output.decision,
    angle: output.decision === 'skip' || !angle ? null : angle,
    risk: output.risk,
    reason: output.reason.trim().slice(0, 500),
    language: output.language.trim().toLowerCase().slice(0, 8),
    archived: output.decision === 'skip' || opportunity < config.engagement.threshold,
  }
}

/**
 * Judges the conversations waiting in the engagement tool: opportunity, decision,
 * angle and risk. A workspace without an Anthropic key is skipped: its items wait.
 */
export async function triageConversations(deps: {
  store: EngagementStore
  model: EngagementModel
  topicId?: string
  limit?: number
}): Promise<EngagementReport> {
  const report: EngagementReport = { triaged: 0, archived: 0, failed: 0, skipped_no_key: 0 }
  const pending = await deps.store.pending({
    limit: deps.limit ?? MAX_ENGAGEMENT_PER_RUN,
    topicId: deps.topicId,
  })
  const keys = new Map<string, string | undefined>()
  const blocked = new Set<string>()

  for (const item of pending) {
    if (!item.topic_config.modules.engagement || blocked.has(item.workspace_id)) continue
    if (!keys.has(item.workspace_id))
      keys.set(item.workspace_id, await deps.store.anthropicKey(item.workspace_id))
    const apiKey = keys.get(item.workspace_id)
    if (!apiKey) {
      blocked.add(item.workspace_id)
      report.skipped_no_key++
      continue
    }

    const model = item.topic_config.ai.triage_model
    const result = await deps.model({
      apiKey,
      model,
      system: engagementSystemPrompt({ name_en: item.topic_name_en, config: item.topic_config }),
      user: engagementUserMessage(item),
    })
    if (result.usage) {
      await deps.store.logUsage(item, {
        provider: 'anthropic',
        model,
        operation: 'engagement_triage',
        units: { ...result.usage, prompt_version: ENGAGEMENT_PROMPT_VERSION },
        cost_usd: claudeCostUsd(model, result.usage),
      })
    }
    if (result.ok) {
      const decision = decideEngagement(result.output, item.topic_config)
      await deps.store.saveDecision(item, decision)
      report.triaged++
      if (decision.archived) report.archived++
      continue
    }
    if (result.error === 'invalid_credential') {
      await deps.store.markCredentialInvalid(item.workspace_id)
      blocked.add(item.workspace_id)
      continue
    }
    if (result.error === 'rate_limited') {
      blocked.add(item.workspace_id)
      continue
    }
    await deps.store.saveFailure(item, result.error)
    report.failed++
  }
  return report
}
