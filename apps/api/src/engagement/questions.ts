import { claudeCostUsd, langName, parseTopicConfig } from '@glimr/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { ComposeModel } from '../compose/model'
import { missingKeyError } from '../lib/key-error'

export const QUESTIONS_PROMPT_VERSION = 'questions-v1'
/** Conversations read: the most recent ones, within this many days. */
export const QUESTIONS_WINDOW_DAYS = 60
const MAX_CONVERSATIONS = 80
const MIN_CONVERSATIONS = 3
const EXCERPT_CHARS = 400

export const questionsOutputSchema = z.object({
  ideas: z
    .array(
      z.object({
        question: z.string().describe('The recurring question, as people ask it, in one sentence'),
        angle: z
          .string()
          .describe(
            'What a post answering it should say, from what the conversations show, 2 to 3 sentences',
          ),
        conversations: z
          .array(z.number().int())
          .describe('Numbers of the conversations where this question comes up'),
      }),
    )
    .describe('At most 5 recurring questions, the most frequent first'),
})
export type QuestionsOutput = z.infer<typeof questionsOutputSchema>

/** Only how the tool works: grouping, grounding in the conversations, output language. */
export function questionsSystemPrompt(uiLang: 'fr' | 'en'): string {
  return `You read the beginning of online conversations about one subject, each with a number. Find the questions people ask again and again, so that the person can write posts that answer them.
- A recurring question is one asked, in any wording, in at least 2 different conversations. Give at most 5, the most frequent first. Fewer is fine; none is fine.
- For each question, give its wording as people ask it, an angle for a post that answers it (what the post should cover, from what the conversations show), and the numbers of the conversations where it comes up.
- Use only what the conversations say. Never invent a fact, figure, name or quote.
- Write the questions and angles in ${langName(uiLang, 'en')}.`
}

export function questionsUserMessage(
  topicName: string,
  conversations: { title: string; excerpt: string }[],
): string {
  return [
    `Subject: ${topicName}`,
    '',
    ...conversations.map((c, i) =>
      [`[${i + 1}] ${c.title}`, c.excerpt ? c.excerpt : null].filter(Boolean).join('\n'),
    ),
  ].join('\n\n')
}

export interface QuestionIdea {
  question: string
  angle: string
  count: number
  examples: { title: string; url: string }[]
}

/** Keeps the questions of at least 2 known conversations, with up to 3 of them as examples. */
export function toQuestionIdeas(
  output: QuestionsOutput,
  conversations: { title: string; url: string }[],
): QuestionIdea[] {
  return output.ideas
    .map((idea) => {
      const refs = [...new Set(idea.conversations)]
        .map((n) => conversations[n - 1])
        .filter((c): c is { title: string; url: string } => !!c)
      return {
        question: idea.question.trim().slice(0, 300),
        angle: idea.angle.trim().slice(0, 1000),
        count: refs.length,
        examples: refs.slice(0, 3),
      }
    })
    .filter((idea) => idea.question && idea.count >= 2)
    .slice(0, 5)
}

interface Row {
  topic_id: string
  status: string
  ui_lang: 'fr' | 'en'
  topic: { workspace_id: string; name_en: string; config: unknown; monthly_budget_usd: number }
}

interface ConversationRow {
  item: { title: string; canonical_url: string; fetched_content: string | null }
}

/**
 * Job: groups the recent conversations of a topic into recurring questions, ideas for posts
 * in Création. On the workspace's AI, within the topic's budget. `db` uses the secret key.
 */
export async function runQuestionIdeas(
  db: SupabaseClient,
  topicId: string,
  model: ComposeModel,
  now = new Date(),
): Promise<string> {
  const { data: row, error } = await db
    .from('question_ideas')
    .select(
      'topic_id, status, ui_lang, topic:topics!inner (workspace_id, name_en, config, monthly_budget_usd)',
    )
    .eq('topic_id', topicId)
    .maybeSingle<Row>()
  if (error) throw error
  if (!row || row.status !== 'pending') return 'skipped'
  const finish = async (fields: Record<string, unknown>) => {
    const { error: updateError } = await db
      .from('question_ideas')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('topic_id', topicId)
    if (updateError) throw updateError
  }

  const since = new Date(now.getTime() - QUESTIONS_WINDOW_DAYS * 86_400_000).toISOString()
  const { data: rows, error: listError } = await db
    .from('item_topics')
    .select('item:items!inner (title, canonical_url, fetched_content)')
    .eq('topic_id', topicId)
    .eq('module', 'engagement')
    .neq('status', 'archived')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_CONVERSATIONS)
    .returns<ConversationRow[]>()
  if (listError) throw listError
  const conversations = rows.map((r) => ({
    title: r.item.title,
    url: r.item.canonical_url,
    excerpt: (r.item.fetched_content ?? '').replace(/\s+/g, ' ').trim().slice(0, EXCERPT_CHARS),
  }))
  if (conversations.length < MIN_CONVERSATIONS) {
    await finish({ status: 'failed', error: 'insufficient_content' })
    return 'insufficient_content'
  }

  const { data: usage, error: usageError } = await db.rpc('topic_month_usage', {
    p_topic_id: topicId,
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
  // Grouping short texts: the triage model is enough.
  const modelId = config.ai.triage_model
  const result = await model<QuestionsOutput>({
    apiKey,
    model: modelId,
    effort: 'low',
    system: questionsSystemPrompt(row.ui_lang),
    content: questionsUserMessage(row.topic.name_en, conversations),
    schema: questionsOutputSchema,
  })
  if (result.usage) {
    const used = result.model ?? modelId
    const { error: logError } = await db.from('usage_log').insert({
      workspace_id: row.topic.workspace_id,
      topic_id: topicId,
      provider: 'anthropic',
      model: used,
      operation: 'question_ideas',
      units: { ...result.usage, prompt_version: QUESTIONS_PROMPT_VERSION },
      cost_usd: claudeCostUsd(used, result.usage),
    })
    if (logError) throw logError
  }
  if (!result.ok) {
    await finish({ status: 'failed', error: result.error })
    return result.error
  }
  await finish({
    status: 'idle',
    error: null,
    ideas: toQuestionIdeas(result.output, conversations),
    generated_at: new Date().toISOString(),
  })
  return 'done'
}
