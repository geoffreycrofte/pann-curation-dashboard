import Anthropic from '@anthropic-ai/sdk'
import { bodyLimit, claudeCostUsd, parseTopicConfig, POST_LIMITS } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  REWRITE_PROMPT_VERSION,
  rewriteRequestSchema,
  rewriteSystemPrompt,
  rewriteUserMessage,
} from './prompt'

export type RewriteModel = (call: {
  apiKey: string
  model: string
  system: string
  user: string
}) => Promise<
  | {
      ok: true
      text: string
      model: string
      usage: { input_tokens: number; output_tokens: number }
    }
  | { ok: false; error: string; usage?: { input_tokens: number; output_tokens: number } }
>

export const claudeRewriteModel: RewriteModel = async ({ apiKey, model, system, user }) => {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 })
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: user }],
    })
    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    }
    if (response.stop_reason === 'refusal') return { ok: false, error: 'refusal', usage }
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim()
    if (!text) return { ok: false, error: 'invalid_output', usage }
    return { ok: true, text, model: response.model, usage }
  } catch (err) {
    if (
      err instanceof Anthropic.AuthenticationError ||
      err instanceof Anthropic.PermissionDeniedError
    )
      return { ok: false, error: 'invalid_credential:anthropic' }
    if (err instanceof Anthropic.RateLimitError)
      return { ok: false, error: 'rate_limited:anthropic' }
    if (err instanceof Anthropic.APIError) return { ok: false, error: 'provider_error:anthropic' }
    throw err
  }
}

interface RewriteRow {
  id: string
  topic_id: string
  item_id: string
  request: unknown
  status: string
  topic: { workspace_id: string; name_en: string; config: unknown; monthly_budget_usd: number }
  item: { canonical_url: string }
}

/** Job: runs one rewrite request (secret key) and stores its result on the row. */
export async function runRewrite(db: SupabaseClient, id: string, model: RewriteModel) {
  const { data: row, error } = await db
    .from('rewrites')
    .select(
      'id, topic_id, item_id, request, status, ' +
        'topic:topics!inner (workspace_id, name_en, config, monthly_budget_usd), ' +
        'item:items!inner (canonical_url)',
    )
    .eq('id', id)
    .maybeSingle<RewriteRow>()
  if (error) throw error
  if (!row || row.status !== 'pending') return

  const finish = async (patch: { status: 'done' | 'failed'; result?: string; error?: string }) => {
    const { error: updateError } = await db
      .from('rewrites')
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq('id', id)
    if (updateError) throw updateError
  }

  const request = rewriteRequestSchema.safeParse(row.request)
  if (!request.success) return finish({ status: 'failed', error: 'invalid_config' })
  const config = parseTopicConfig(row.topic.config)

  // Same monthly budget as drafting.
  const { data: usage, error: usageError } = await db.rpc('topic_month_usage', {
    p_topic_id: row.topic_id,
  })
  if (usageError) throw usageError
  const spent = ((usage ?? []) as { cost_usd: number | string }[]).reduce(
    (sum, r) => sum + Number(r.cost_usd),
    0,
  )
  if (spent >= Number(row.topic.monthly_budget_usd))
    return finish({ status: 'failed', error: 'budget_exceeded' })

  const { data: secrets, error: secretError } = await db.rpc('workspace_credentials_for_jobs', {
    p_workspace_id: row.topic.workspace_id,
  })
  if (secretError) throw secretError
  const apiKey = ((secrets ?? []) as { provider: string; secret: string }[]).find(
    (s) => s.provider === 'anthropic',
  )?.secret
  if (!apiKey) return finish({ status: 'failed', error: 'missing_credential:anthropic' })

  const target = request.data.target
  let maxChars: number | undefined
  if (target.kind === 'post') {
    let limit = POST_LIMITS[target.channel]
    if (target.channel === 'mastodon') {
      const { data: mastodon } = await db
        .from('workspace_credentials')
        .select('meta')
        .eq('workspace_id', row.topic.workspace_id)
        .eq('provider', 'mastodon')
        .maybeSingle<{ meta: { max_characters?: number } }>()
      limit = mastodon?.meta.max_characters ?? limit
    }
    maxChars = bodyLimit(target.channel, row.item.canonical_url, limit)
  }

  const modelId = config.ai.draft_model
  const result = await model({
    apiKey,
    model: modelId,
    system: rewriteSystemPrompt({ name_en: row.topic.name_en, config }, target, maxChars),
    user: rewriteUserMessage(request.data),
  })
  if (result.usage) {
    const answered = result.ok ? result.model : modelId
    const { error: logError } = await db.from('usage_log').insert({
      workspace_id: row.topic.workspace_id,
      topic_id: row.topic_id,
      provider: 'anthropic',
      model: answered,
      operation: 'rewrite',
      units: { ...result.usage, prompt_version: REWRITE_PROMPT_VERSION },
      cost_usd: claudeCostUsd(answered, result.usage),
    })
    if (logError) throw logError
  }
  if (!result.ok) return finish({ status: 'failed', error: result.error })
  await finish({ status: 'done', result: result.text })

  // Requests are only read right after they finish: keep a week.
  await db
    .from('rewrites')
    .delete()
    .lt('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())
}
