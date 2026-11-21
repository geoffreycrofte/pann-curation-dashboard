import {
  claudeCostUsd,
  DRAFT_CHANNELS,
  draftChannels,
  missingPosts,
  postLength,
  postSignature,
  SOURCE_TEXT_MIN,
  type DraftChannel,
  type Lang,
  type TopicConfig,
} from '@pann/shared'
import type { UsageEntry } from '../collect/types'
import type { DraftModel, DraftResult } from './model'
import {
  DRAFT_PROMPT_VERSION,
  draftSystemPrompt,
  draftUserMessage,
  type DraftOutput,
} from './prompt'

export interface PendingDraft {
  item_id: string
  topic_id: string
  workspace_id: string
  topic_name_en: string
  topic_config: TopicConfig
  monthly_budget_usd: number
  draft_attempts: number
  /** 'missing': only the posts the item lacks; summaries and other posts stay. */
  draft_scope: 'all' | 'missing'
  /** Posts the item already has (read for the 'missing' scope). */
  existing_posts: { channel: DraftChannel; lang: Lang | null }[]
  title: string
  canonical_url: string
  published_at: string | null
  source_lang: string | null
  fetched_content: string | null
}

export interface DraftWrite {
  model: string
  prompt_version: string
  summaries: { lang: Lang; summary: string }[]
  key_excerpt: string
  source_nature: string
  posts: { channel: DraftChannel; lang: Lang; body: string }[]
  /** Only add these posts: summaries and existing posts are left as they are. */
  posts_only?: boolean
}

export interface DraftStore {
  pending(options: { limit: number; topicId?: string; itemId?: string }): Promise<PendingDraft[]>
  anthropicKey(workspaceId: string): Promise<string | undefined>
  /** Why there is no key (quota used up on plans where Pann provides the AI). */
  missingKeyError?(workspaceId: string): Promise<string>
  markCredentialInvalid(workspaceId: string): Promise<void>
  monthCostUsd(topicId: string): Promise<number>
  /** Page text for items collected without content (manual links, short feeds). */
  fetchContent(item: PendingDraft): Promise<string | null>
  saveDraft(item: PendingDraft, draft: DraftWrite): Promise<void>
  /** final: no retry (insufficient content, budget, missing key). */
  saveFailure(item: PendingDraft, error: string, final: boolean): Promise<void>
  logUsage(item: PendingDraft, usage: UsageEntry): Promise<void>
}

export const MAX_DRAFT_ATTEMPTS = 3
export const MAX_DRAFTS_PER_RUN = 5
/** Below this, the stored content is considered too thin and the page is fetched. */
const MIN_CONTENT_CHARS = SOURCE_TEXT_MIN

/** Longest LinkedIn signature of the topic, so that every language fits. */
export function longestSignature(config: TopicConfig): string {
  return config.output_langs
    .map((lang) => postSignature(config, 'linkedin', lang))
    .reduce((longest, s) => (postLength(s) > postLength(longest) ? s : longest), '')
}

const EMPTY_WRITE: DraftWrite = {
  model: '',
  prompt_version: DRAFT_PROMPT_VERSION,
  summaries: [],
  key_excerpt: '',
  source_nature: '',
  posts: [],
}

export interface DraftReport {
  drafted: number
  failed: number
  skipped: number
}

export function toDraftWrite(
  output: DraftOutput,
  model: string,
  channels: readonly DraftChannel[],
  langs: readonly Lang[],
): DraftWrite {
  // A language the model left out is skipped rather than saved empty.
  return {
    model,
    prompt_version: DRAFT_PROMPT_VERSION,
    summaries: langs.flatMap((lang) => {
      const summary = output.summaries[lang]?.trim()
      return summary ? [{ lang, summary }] : []
    }),
    key_excerpt: output.key_excerpt.trim(),
    source_nature: output.source_type,
    posts: channels.flatMap((channel) =>
      langs.flatMap((lang) => {
        const body = output.posts[channel]?.[lang]?.trim()
        return body ? [{ channel, lang, body }] : []
      }),
    ),
  }
}

function usageEntry(result: DraftResult, requestedModel: string): UsageEntry | null {
  if (!result.usage) return null
  const model = result.model ?? requestedModel
  return {
    provider: 'anthropic',
    model,
    operation: 'draft',
    units: { ...result.usage, prompt_version: DRAFT_PROMPT_VERSION },
    cost_usd: claudeCostUsd(model, result.usage),
  }
}

/**
 * Writes summaries and post drafts for the items queued for drafting. Each topic has a
 * monthly budget: once spent, drafting stops (triage goes on, as in docs/CONTEXT.md).
 */
export async function draft(deps: {
  store: DraftStore
  model: DraftModel
  topicId?: string
  itemId?: string
  limit?: number
}): Promise<DraftReport> {
  const report: DraftReport = { drafted: 0, failed: 0, skipped: 0 }
  const pending = await deps.store.pending({
    limit: deps.limit ?? MAX_DRAFTS_PER_RUN,
    topicId: deps.topicId,
    itemId: deps.itemId,
  })
  const blocked = new Set<string>()

  for (const item of pending) {
    if (blocked.has(item.workspace_id)) {
      report.skipped++
      continue
    }
    if ((await deps.store.monthCostUsd(item.topic_id)) >= item.monthly_budget_usd) {
      await deps.store.saveFailure(item, 'budget_exceeded', true)
      report.skipped++
      continue
    }
    const apiKey = await deps.store.anthropicKey(item.workspace_id)
    if (!apiKey) {
      const reason =
        (await deps.store.missingKeyError?.(item.workspace_id)) ?? 'missing_credential:anthropic'
      await deps.store.saveFailure(item, reason, true)
      report.skipped++
      continue
    }

    let content = item.fetched_content ?? ''
    if (content.length < MIN_CONTENT_CHARS)
      content = (await deps.store.fetchContent(item)) ?? content

    // Missing posts only: nothing to write when the item already has them all.
    const missing =
      item.draft_scope === 'missing' ? missingPosts(item.topic_config, item.existing_posts) : null
    if (missing && !missing.length) {
      await deps.store.saveDraft(item, { ...EMPTY_WRITE, posts_only: true })
      report.drafted++
      continue
    }

    const requestedModel = item.topic_config.ai.draft_model
    const channels = missing
      ? DRAFT_CHANNELS.filter((c) => missing.some((m) => m.channel === c))
      : draftChannels(item.topic_config)
    // Missing posts: only their languages are asked for.
    const langs = missing
      ? item.topic_config.output_langs.filter((lang) => missing.some((m) => m.lang === lang))
      : item.topic_config.output_langs
    const result = await deps.model({
      channels,
      langs,
      apiKey,
      model: requestedModel,
      effort: item.topic_config.ai.draft_effort,
      system: draftSystemPrompt({ name_en: item.topic_name_en, config: item.topic_config }),
      user: draftUserMessage({ ...item, content }, channels, {
        linkedin: longestSignature(item.topic_config),
      }),
    })
    const usage = usageEntry(result, requestedModel)
    if (usage) await deps.store.logUsage(item, usage)

    if (result.ok) {
      if (result.output.insufficient_content) {
        await deps.store.saveFailure(item, 'insufficient_content', true)
        report.failed++
        continue
      }
      const write = toDraftWrite(result.output, result.model, channels, langs)
      await deps.store.saveDraft(
        item,
        missing
          ? {
              ...write,
              posts_only: true,
              posts: write.posts.filter((p) =>
                missing.some((m) => m.channel === p.channel && m.lang === p.lang),
              ),
            }
          : write,
      )
      report.drafted++
      continue
    }
    if (result.error === 'invalid_credential') {
      await deps.store.markCredentialInvalid(item.workspace_id)
      await deps.store.saveFailure(item, 'invalid_credential:anthropic', true)
      blocked.add(item.workspace_id)
      report.failed++
      continue
    }
    if (result.error === 'rate_limited') {
      blocked.add(item.workspace_id)
      report.skipped++
      continue
    }
    await deps.store.saveFailure(item, result.error, item.draft_attempts + 1 >= MAX_DRAFT_ATTEMPTS)
    report.failed++
  }
  return report
}
