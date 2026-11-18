import { claudeCostUsd, errorCode, langName, parseTopicConfig } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { ComposeModel } from '../compose/model'

export const VOICE_PROMPT_VERSION = 'voice-v1'

export const voiceOutputSchema = z.object({
  style_rules: z
    .string()
    .describe('How the person writes: tone, person, sentence length, vocabulary, structure'),
  post_rules: z
    .string()
    .describe(
      'Their conventions in posts: hashtags, emoji, mentions, links, call to action, length',
    ),
})
export type VoiceOutput = z.infer<typeof voiceOutputSchema>

/**
 * Only what the tool does with the samples: describe the voice they show, as rules the
 * drafting can follow. No style of its own, no judgement on the samples.
 */
export function voiceSystemPrompt(uiLang: 'fr' | 'en'): string {
  return `You read social media posts written by one person and describe their voice as short rules that another writer could follow to write like them.
- style_rules: tone, grammatical person and form of address, sentence length, vocabulary, structure, typography habits.
- post_rules: use of hashtags (how many, where, their case), emoji, mentions, links, calls to action, usual length.
- Describe only what the posts show, as instructions ("Write…", "Use…"), one per line, at most 8 lines each. No judgement, no advice to change.
- Write the rules in ${langName(uiLang, 'en')}.`
}

interface AnalysisRow {
  id: string
  topic_id: string
  samples: string
  ui_lang: 'fr' | 'en'
  status: string
  topic: { workspace_id: string; config: unknown; monthly_budget_usd: number }
}

/** Job: proposes the voice rules from the pasted posts. `db` uses the secret key. */
export async function runVoiceAnalysis(
  db: SupabaseClient,
  analysisId: string,
  model: ComposeModel,
): Promise<string> {
  const { data: row, error } = await db
    .from('voice_analyses')
    .select(
      'id, topic_id, samples, ui_lang, status, topic:topics!inner (workspace_id, config, monthly_budget_usd)',
    )
    .eq('id', analysisId)
    .maybeSingle<AnalysisRow>()
  if (error) throw error
  if (!row || row.status !== 'pending') return 'skipped'
  const finish = async (fields: Record<string, unknown>) => {
    const { error: updateError } = await db
      .from('voice_analyses')
      .update(fields)
      .eq('id', analysisId)
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
    await finish({ status: 'failed', error: errorCode('missing_credential', 'anthropic') })
    return 'missing_credential'
  }

  const config = parseTopicConfig(row.topic.config)
  const modelId = config.ai.draft_model
  const result = await model<VoiceOutput>({
    apiKey,
    model: modelId,
    effort: 'low',
    system: voiceSystemPrompt(row.ui_lang),
    content: `Posts written by the person:\n\n${row.samples.trim()}`,
    schema: voiceOutputSchema,
  })
  if (result.usage) {
    const used = result.model ?? modelId
    const { error: logError } = await db.from('usage_log').insert({
      workspace_id: row.topic.workspace_id,
      topic_id: row.topic_id,
      provider: 'anthropic',
      model: used,
      operation: 'voice',
      units: { ...result.usage, prompt_version: VOICE_PROMPT_VERSION },
      cost_usd: claudeCostUsd(used, result.usage),
    })
    if (logError) throw logError
  }
  if (!result.ok) {
    await finish({ status: 'failed', error: result.error })
    return result.error
  }
  await finish({
    status: 'done',
    error: null,
    result: {
      style_rules: result.output.style_rules.trim().slice(0, 4000),
      post_rules: result.output.post_rules.trim().slice(0, 4000),
    },
  })
  return 'done'
}
