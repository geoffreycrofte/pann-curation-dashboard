import { claudeCostUsd, ITEM_KINDS, type ItemKind, type TopicConfig } from '@pann/shared'
import type { UsageEntry } from '../collect/types'
import type { TriageModel } from './model'
import {
  TRIAGE_PROMPT_VERSION,
  triageSystemPrompt,
  triageUserMessage,
  type TriageItem,
} from './prompt'

/** Items waiting for triage, with what the prompt needs. */
export interface PendingTriage extends TriageItem {
  item_id: string
  topic_id: string
  workspace_id: string
  topic_name_en: string
  topic_config: TopicConfig
  item_kind: ItemKind | null
  source_lang: string | null
  triage_attempts: number
}

export interface TriageDecision {
  relevance: number
  commercial: boolean
  reason: string
  kind: ItemKind
  language: string
  /** Below the topic threshold: archived, out of the board but still searchable. */
  archived: boolean
}

export interface TriageStore {
  pending(options: { limit: number; topicId?: string }): Promise<PendingTriage[]>
  anthropicKey(workspaceId: string): Promise<string | undefined>
  markCredentialInvalid(workspaceId: string): Promise<void>
  saveDecision(item: PendingTriage, decision: TriageDecision): Promise<void>
  saveFailure(item: PendingTriage, error: string): Promise<void>
  logUsage(item: PendingTriage, usage: UsageEntry): Promise<void>
}

export const MAX_TRIAGE_ATTEMPTS = 3
/** Per invocation: bounded time and Workers subrequests. */
export const MAX_TRIAGE_PER_RUN = 25

export interface TriageReport {
  triaged: number
  archived: number
  failed: number
  /** Workspaces skipped because no valid Anthropic key is set. */
  skipped_no_key: number
}

export function decide(
  output: {
    relevance: number
    commercial: boolean
    reason: string
    kind: string
    language: string
  },
  config: TopicConfig,
): TriageDecision {
  const relevance = Math.max(0, Math.min(100, Math.round(output.relevance)))
  return {
    relevance,
    commercial: output.commercial,
    reason: output.reason.trim().slice(0, 500),
    kind: (ITEM_KINDS as readonly string[]).includes(output.kind)
      ? (output.kind as ItemKind)
      : 'news',
    language: output.language.trim().toLowerCase().slice(0, 8),
    archived: relevance < config.ai.relevance_threshold,
  }
}

/**
 * Scores the items waiting in "To sort" (relevance not set yet). Items below the topic
 * threshold are archived. A workspace without an Anthropic key is skipped: its items wait.
 */
export async function triage(deps: {
  store: TriageStore
  model: TriageModel
  topicId?: string
  limit?: number
}): Promise<TriageReport> {
  const report: TriageReport = { triaged: 0, archived: 0, failed: 0, skipped_no_key: 0 }
  const pending = await deps.store.pending({
    limit: deps.limit ?? MAX_TRIAGE_PER_RUN,
    topicId: deps.topicId,
  })
  const keys = new Map<string, string | undefined>()
  const blocked = new Set<string>()

  for (const item of pending) {
    if (blocked.has(item.workspace_id)) continue
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
      system: triageSystemPrompt({ name_en: item.topic_name_en, config: item.topic_config }),
      user: triageUserMessage(item),
    })

    if (result.usage) {
      await deps.store.logUsage(item, {
        provider: 'anthropic',
        model,
        operation: 'triage',
        units: { ...result.usage, prompt_version: TRIAGE_PROMPT_VERSION },
        cost_usd: claudeCostUsd(model, result.usage),
      })
    }

    if (result.ok) {
      const decision = decide(result.output, item.topic_config)
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
      // Try again on the next run, without counting an attempt.
      blocked.add(item.workspace_id)
      continue
    }
    await deps.store.saveFailure(item, result.error)
    report.failed++
  }
  return report
}
