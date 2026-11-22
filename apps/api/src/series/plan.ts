import { claudeCostUsd, errorCode, langName, parseTopicConfig } from '@glimr/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { ComposeModel } from '../compose/model'
import { missingKeyError } from '../lib/key-error'

export const SERIES_PROMPT_VERSION = 'series-v1'

export function seriesOutputSchema(count: number) {
  return z.object({
    posts: z
      .array(
        z.object({
          subject: z.string().describe('What this post is about, in one sentence'),
          angle: z
            .string()
            .describe(
              'What this post says and which facts of the material it uses, 2 to 4 sentences',
            ),
        }),
      )
      .describe(`Exactly ${count} posts, in publication order`),
  })
}
export type SeriesOutput = { posts: { subject: string; angle: string }[] }

/**
 * Only how the tool plans: one angle per post, in order, grounded in the material given
 * (the person's notes and their product settings). Voice and wording come later, from
 * the topic settings, when each post is written.
 */
export function seriesSystemPrompt(uiLang: 'fr' | 'en'): string {
  return `You plan a series of social media posts on one subject for a person, to be published over a period. Each post gets a subject and an angle; the posts are written later, one by one, from these angles only.
- Each post has its own point: no two posts repeat the same idea. The order builds up (from the context to the details, or from the problem to the answer).
- Use only facts from the material given (the person's notes and product description). Never invent a figure, date, name, quote or claim; put in each angle the facts that post will need.
- Write the subjects and angles in ${langName(uiLang, 'en')}.`
}

export function seriesUserMessage(series: {
  subject: string
  notes: string
  post_count: number
  span_days: number
  product: { name: string; description: string; audience: string; messages: string }
}): string {
  const product = series.product
  return [
    `Subject of the series: ${series.subject}`,
    `Number of posts: ${series.post_count}, published over ${series.span_days} days.`,
    '',
    'Notes of the person:',
    series.notes.trim() || '(none)',
    '',
    'Product:',
    product.name ? `Name: ${product.name}` : null,
    product.description ? `Description: ${product.description}` : null,
    product.audience ? `Audience: ${product.audience}` : null,
    product.messages ? `Key messages: ${product.messages}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n')
}

interface SeriesRow {
  id: string
  topic_id: string
  subject: string
  notes: string
  post_count: number
  span_days: number
  ui_lang: 'fr' | 'en'
  status: string
  topic: { workspace_id: string; config: unknown; monthly_budget_usd: number }
}

/** Job: proposes the plan of a series. `db` uses the secret key. */
export async function runSeriesPlan(
  db: SupabaseClient,
  seriesId: string,
  model: ComposeModel,
): Promise<string> {
  const { data: row, error } = await db
    .from('series')
    .select(
      'id, topic_id, subject, notes, post_count, span_days, ui_lang, status, topic:topics!inner (workspace_id, config, monthly_budget_usd)',
    )
    .eq('id', seriesId)
    .maybeSingle<SeriesRow>()
  if (error) throw error
  if (!row || row.status !== 'pending') return 'skipped'
  const finish = async (fields: Record<string, unknown>) => {
    const { error: updateError } = await db.from('series').update(fields).eq('id', seriesId)
    if (updateError) throw updateError
  }

  const { data: usage, error: usageError } = await db.rpc('topic_month_usage', {
    p_topic_id: row.topic_id,
  })
  if (usageError) throw usageError
  const spent = ((usage ?? []) as { cost_usd: number | string }[]).reduce(
    (sum, r) => sum + Number(r.cost_usd),
    0,
  )
  if (spent >= Number(row.topic.monthly_budget_usd)) {
    await finish({ status: 'failed', error: 'budget_exceeded' })
    return 'budget_exceeded'
  }
  const { data: keys, error: keysError } = await db.rpc('workspace_credentials_for_jobs', {
    p_workspace_id: row.topic.workspace_id,
  })
  if (keysError) throw keysError
  const apiKey = ((keys ?? []) as { provider: string; secret: string }[]).find(
    (k) => k.provider === 'anthropic',
  )?.secret
  if (!apiKey) {
    await finish({
      status: 'failed',
      error: await missingKeyError(db, row.topic.workspace_id, 'anthropic'),
    })
    return 'missing_credential'
  }

  const config = parseTopicConfig(row.topic.config)
  const modelId = config.ai.draft_model
  const result = await model<SeriesOutput>({
    apiKey,
    model: modelId,
    effort: 'medium',
    system: seriesSystemPrompt(row.ui_lang),
    content: seriesUserMessage({ ...row, product: config.product }),
    schema: seriesOutputSchema(row.post_count),
  })
  if (result.usage) {
    const used = result.model ?? modelId
    const { error: logError } = await db.from('usage_log').insert({
      workspace_id: row.topic.workspace_id,
      topic_id: row.topic_id,
      provider: 'anthropic',
      model: used,
      operation: 'series_plan',
      units: { ...result.usage, prompt_version: SERIES_PROMPT_VERSION },
      cost_usd: claudeCostUsd(used, result.usage),
    })
    if (logError) throw logError
  }
  if (!result.ok) {
    await finish({ status: 'failed', error: result.error })
    return result.error
  }
  const plan = result.output.posts
    .slice(0, row.post_count)
    .map((p) => ({ subject: p.subject.trim().slice(0, 300), angle: p.angle.trim().slice(0, 2000) }))
    .filter((p) => p.subject)
  await finish({ status: 'ready', error: null, plan })
  return 'done'
}
