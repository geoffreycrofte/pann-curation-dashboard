import {
  claudeCostUsd,
  type ConversationMeta,
  langName,
  parseTopicConfig,
  POST_LIMITS,
} from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RewriteModel } from '../rewrite/rewrite'
import { ENGAGEMENT_CONTENT_CHARS, productBlock, type EngagementTopic } from './prompt'

/** Bump when the prompt changes. Stored with the usage of each reply. */
export const REPLY_PROMPT_VERSION = 'engagement-reply-v1'

/** Longest reply stored (column check), and the platform limits below it. */
export const REPLY_MAX_CHARS = 4000
export function replyLimit(platform: ConversationMeta['platform']): number {
  return platform === 'bluesky' ? POST_LIMITS.bluesky : 2000
}

/**
 * How the tool writes a reply is built in: help first, grounded in the conversation, the
 * link to the product said when the product is mentioned (docs/engagement/brief.md).
 * Tone, style and vocabulary are the person's settings (ai.style_rules).
 */
export function replySystemPrompt(
  topic: EngagementTopic,
  conversation: { platform: ConversationMeta['platform']; lang: string | null },
): string {
  const { style_rules } = topic.config.ai
  const lang = conversation.lang
    ? langName(conversation.lang, 'en')
    : 'the language of the conversation'
  const limit = replyLimit(conversation.platform)
  return `You draft a reply to a public conversation for a person on the team behind a product. The person reads your draft, changes it as they see fit and posts it themself: nothing is posted automatically.

# The product (set by the team)${productBlock(topic, { proofPoints: true, disclosure: true })}

# How to write the reply
- Answer what the person in the conversation asked or needs, with concrete help: a method, a step, a fact, a pointer. The reply must be useful even to someone who will never use the product.
- Ground every statement in the conversation or in the product description above. Never invent facts, numbers, features or quotes.
- Mention the product only when it directly helps with the problem raised. When you mention it, say that the author is part of the team behind it${topic.config.product.disclosure.trim() ? ', using the disclosure sentence above' : ''}.
- Never use a wording listed under "Never claim".
- Write in ${lang}. Plain text: no headings, no bullet lists unless the conversation uses them, no hashtags.
- At most ${limit} characters, counting every character.
- Return only the text of the reply, without quotes or comments.${style_rules.trim() ? `\n\n# Style rules (set by the team)\n${style_rules.trim()}` : ''}`
}

export function replyUserMessage(conversation: {
  title: string
  canonical_url: string
  fetched_content: string | null
  meta: ConversationMeta
  angle: string | null
}): string {
  const { meta } = conversation
  const content = (conversation.fetched_content ?? '').slice(0, ENGAGEMENT_CONTENT_CHARS).trim()
  return [
    `Platform: ${meta.platform ?? 'unknown'}`,
    meta.thread_title ? `Thread: ${meta.thread_title}` : `Title: ${conversation.title}`,
    `URL: ${conversation.canonical_url}`,
    meta.author ? `Author: ${meta.author}` : null,
    conversation.angle ? `How a reply could help (from the review): ${conversation.angle}` : null,
    '',
    'Conversation:',
    content || '(no text available)',
  ]
    .filter((line) => line !== null)
    .join('\n')
}

interface ReplyRow {
  item_id: string
  topic_id: string
  reply_status: string
  engagement_angle: string | null
  topic: { workspace_id: string; name_en: string; config: unknown; monthly_budget_usd: number }
  item: {
    title: string
    canonical_url: string
    fetched_content: string | null
    source_lang: string | null
    meta: ConversationMeta | null
  }
}

/** Job: drafts the reply asked from the board (secret key), stored on the conversation. */
export async function runReplyDraft(
  db: SupabaseClient,
  topicId: string,
  itemId: string,
  model: RewriteModel,
) {
  const { data: row, error } = await db
    .from('item_topics')
    .select(
      'item_id, topic_id, reply_status, engagement_angle, ' +
        'topic:topics!inner (workspace_id, name_en, config, monthly_budget_usd), ' +
        'item:items!inner (title, canonical_url, fetched_content, source_lang, meta)',
    )
    .eq('topic_id', topicId)
    .eq('item_id', itemId)
    .eq('module', 'engagement')
    .maybeSingle<ReplyRow>()
  if (error) throw error
  if (!row || row.reply_status !== 'pending') return

  const finish = async (patch: { reply_draft?: string; reply_error?: string }) => {
    const { error: updateError } = await db
      .from('item_topics')
      .update(
        patch.reply_error
          ? { reply_status: 'failed', reply_error: patch.reply_error }
          : { reply_status: 'ready', reply_error: null, reply_draft: patch.reply_draft },
      )
      .eq('topic_id', topicId)
      .eq('item_id', itemId)
    if (updateError) throw updateError
  }

  const config = parseTopicConfig(row.topic.config)

  // Same monthly budget as the rest of the topic's AI.
  const { data: usage, error: usageError } = await db.rpc('topic_month_usage', {
    p_topic_id: topicId,
  })
  if (usageError) throw usageError
  const spent = ((usage ?? []) as { cost_usd: number | string }[]).reduce(
    (sum, r) => sum + Number(r.cost_usd),
    0,
  )
  if (spent >= Number(row.topic.monthly_budget_usd))
    return finish({ reply_error: 'budget_exceeded' })

  const { data: secrets, error: secretError } = await db.rpc('workspace_credentials_for_jobs', {
    p_workspace_id: row.topic.workspace_id,
  })
  if (secretError) throw secretError
  const apiKey = ((secrets ?? []) as { provider: string; secret: string }[]).find(
    (s) => s.provider === 'anthropic',
  )?.secret
  if (!apiKey) return finish({ reply_error: 'missing_credential:anthropic' })

  const meta = row.item.meta ?? {}
  const modelId = config.ai.draft_model
  const result = await model({
    apiKey,
    model: modelId,
    system: replySystemPrompt(
      { name_en: row.topic.name_en, config },
      { platform: meta.platform, lang: row.item.source_lang },
    ),
    user: replyUserMessage({ ...row.item, meta, angle: row.engagement_angle }),
  })
  if (result.usage) {
    const answered = result.ok ? result.model : modelId
    const { error: logError } = await db.from('usage_log').insert({
      workspace_id: row.topic.workspace_id,
      topic_id: topicId,
      provider: 'anthropic',
      model: answered,
      operation: 'engagement_reply',
      units: { ...result.usage, prompt_version: REPLY_PROMPT_VERSION },
      cost_usd: claudeCostUsd(answered, result.usage),
    })
    if (logError) throw logError
  }
  if (!result.ok) return finish({ reply_error: result.error })
  await finish({ reply_draft: result.text.slice(0, REPLY_MAX_CHARS) })
}
