import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { claudeCostUsd, langName } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { extractArticleText } from '../lib/article-text'
import { fetchText } from '../lib/fetch-text'

/** Pann pays for this conversation: the current Opus, at low effort (a short exchange). */
export const ONBOARDING_MODEL = 'claude-opus-5-5'
export const ONBOARDING_PROMPT_VERSION = 'onboarding-v3'
/** The exchange stops after this many questions, whatever is left. */
export const MAX_QUESTIONS = 6
/** Characters of the site's home page given to the assistant. */
const SITE_CHARS = 6_000

export interface OnboardingContext {
  name: string
  url?: string
  /** Tools chosen: curation (news watch), engagement (conversations), compose (own posts). */
  tools: string[]
  /** Networks the person publishes on, and where they listen. */
  channels: string[]
  listen: string[]
  newsletter?: boolean
  /** Interface language of the person: the assistant writes in it. */
  ui_lang: 'fr' | 'en'
  /**
   * Settings of an existing topic, when the person adjusts it ("Adjust with the
   * assistant"): the assistant proposes changes to them instead of filling them.
   */
  current?: Partial<Record<AdjustableField, string>>
}

/** Settings the assistant can propose for an existing topic, as text. */
export const ADJUSTABLE_FIELDS = [
  'description',
  'audience',
  'messages',
  'claims_to_avoid',
  'output_langs',
  'relevance_criteria',
  'engagement_criteria',
  'style_rules',
  'post_rules',
] as const
export type AdjustableField = (typeof ADJUSTABLE_FIELDS)[number]

export interface OnboardingMessage {
  role: 'user' | 'assistant'
  text: string
  quick_replies?: string[]
}

const text = (description: string) => z.string().nullable().describe(description)

/** What the assistant may propose: the settings of the topic it helps fill. */
export const proposalSchema = z.object({
  name_en: text('Name of the product or subject in English, if it differs'),
  description: text('What the product or subject is, in one or two sentences'),
  audience: text('Who it is for'),
  messages: text('Key messages to convey'),
  claims_to_avoid: text('Promises or wordings never to write'),
  output_langs: z
    .array(z.string())
    .nullable()
    .describe('Languages of the audience, as BCP 47 tags (fr, en, de, pt-BR…)'),
  relevance_criteria: text('What makes a news item worth keeping, and what to leave out'),
  engagement_criteria: text('When a reply from the person really helps in a conversation'),
  style_rules: text('Tone and style of the posts, in the words of the person'),
  post_rules: text('Rules for the posts (length, hashtags, mentions…), as stated'),
  posts_per_day: z.number().int().min(0).max(10).nullable().describe('Posts per day'),
  slots: z.array(z.string()).nullable().describe('Daily publication times, HH:MM'),
})
export type Proposal = z.infer<typeof proposalSchema>

const outputSchema = z.object({
  reply: z.string().describe('The next message to the person'),
  quick_replies: z.array(z.string()).describe('Zero to four short suggested answers'),
  done: z.boolean().describe('true when the useful settings are filled or skipped'),
  proposal: proposalSchema.describe('Every setting proposed so far, kept unless corrected'),
})
export type AssistantOutput = z.infer<typeof outputSchema>

/**
 * Only how the tool works: which settings to fill, one question at a time, what never to
 * ask, when to stop. No tone, style or topic rule: those are what the person tells it.
 */
export function onboardingSystemPrompt(context: OnboardingContext): string {
  if (context.current) return adjustSystemPrompt(context)
  const curation = context.tools.includes('curation')
  const engagement = context.tools.includes('engagement')
  const compose = context.tools.includes('compose')
  const fields = [
    'description and audience',
    'key messages, and claims to avoid',
    ...(curation ? ['what makes a news item worth keeping, and what to leave out'] : []),
    ...(engagement ? ['when a reply helps in a conversation'] : []),
    ...(curation || compose ? ['tone and style of the posts, and rules for the posts'] : []),
  ]
  return `You help a person set up a topic in Pann, a tool that makes a product or a subject known: it collects the news of the subject${curation ? ', drafts social posts and a newsletter' : ''}${compose ? ", writes the person's own posts from their notes" : ''}${engagement ? ', and finds online conversations where the person can help' : ''}.

Your job is to fill these settings through a short conversation: ${fields.join('; ')}.

# How to ask
- Write in ${langName(context.ui_lang, 'en')}, the language of the person.
- One question at a time, short. Offer two to four quick replies when the answer is a choice; otherwise none.
- Never ask what you already know from the context below (name, website, tools, networks).
- Never ask about languages, publication rhythm or budget: they are quick choices that come right after you. Still propose output_langs from the language of the website and of the answers.
- When the website text is given, start by saying in two sentences what you understood, and ask whether it is right.
- Never invent a fact about the product, a source address or a figure. Propose settings only from what the person said or the website says.
- Return the full proposal at every turn: keep earlier values unless the person corrects them; null for what is still unknown.
- Stop when the settings above are filled or the person skipped them, or after ${MAX_QUESTIONS} questions: set done to true and say in one sentence that a few quick choices come next.`
}

/** Adjusting an existing topic: changes to its settings, only those the person wants. */
function adjustSystemPrompt(context: OnboardingContext): string {
  const curation = context.tools.includes('curation')
  const engagement = context.tools.includes('engagement')
  const compose = context.tools.includes('compose')
  return `You help a person adjust the settings of an existing topic in Pann, a tool that makes a product or a subject known: it collects the news of the subject${curation ? ', drafts social posts and a newsletter' : ''}${compose ? ", writes the person's own posts from their notes" : ''}${engagement ? ', and finds online conversations where the person can help' : ''}. The current settings are given below.

# How to ask
- Write in ${langName(context.ui_lang, 'en')}, the language of the person.
- Start by asking, in one sentence, what they want to improve; offer two to four quick replies naming settings.
- One question at a time, short. Offer quick replies when the answer is a choice; otherwise none.
- Never ask about publication rhythm or budget: they are set elsewhere.
- Never invent a fact about the product, a source address or a figure. Propose only from what the person said and the current settings.
- In the proposal, give the full new text of each setting the person wants to change (output_langs as BCP 47 tags); null for every setting that stays as it is. Never copy an unchanged value.
- Return the full proposal at every turn: keep earlier changes unless the person corrects them.
- Stop when the person is satisfied, or after ${MAX_QUESTIONS} questions: set done to true and say in one sentence that the changes are shown next to the current settings, to apply or not.`
}

/** The person's context, then the exchange so far, as API messages. */
export function onboardingMessages(
  context: OnboardingContext,
  history: OnboardingMessage[],
  siteText: string | null,
): Anthropic.Beta.BetaMessageParam[] {
  const intro = [
    `Name: ${context.name}`,
    context.url ? `Website: ${context.url}` : null,
    `Tools chosen: ${context.tools.join(', ') || 'none'}`,
    context.channels.length ? `Publishes on: ${context.channels.join(', ')}` : null,
    context.listen.length ? `Listens on: ${context.listen.join(', ')}` : null,
    context.newsletter ? 'Wants a newsletter.' : null,
    siteText ? `\nWebsite text:\n${siteText}` : null,
    context.current
      ? `\nCurrent settings:\n${ADJUSTABLE_FIELDS.map(
          (field) => `- ${field}: ${context.current?.[field]?.trim() || '(empty)'}`,
        ).join('\n')}`
      : null,
    '\nStart the conversation.',
  ]
    .filter((line) => line !== null)
    .join('\n')
  return [
    { role: 'user', content: intro },
    ...history.map((m) => ({ role: m.role, content: m.text }) as Anthropic.Beta.BetaMessageParam),
  ]
}

export type AssistantModel = (call: {
  apiKey: string
  system: string
  messages: Anthropic.Beta.BetaMessageParam[]
}) => Promise<
  | {
      ok: true
      output: AssistantOutput
      model: string
      usage: Anthropic.Beta.BetaUsage
    }
  | { ok: false; error: string; model?: string; usage?: Anthropic.Beta.BetaUsage }
>

export const claudeAssistantModel: AssistantModel = async ({ apiKey, system, messages }) => {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 })
  try {
    const response = await client.beta.messages.parse({
      model: ONBOARDING_MODEL,
      max_tokens: 8_000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages,
      output_config: { effort: 'low', format: betaZodOutputFormat(outputSchema) },
    })
    if (response.stop_reason === 'refusal')
      return { ok: false, error: 'refusal', model: response.model, usage: response.usage }
    if (!response.parsed_output)
      return { ok: false, error: 'invalid_output', model: response.model, usage: response.usage }
    return {
      ok: true,
      output: response.parsed_output as AssistantOutput,
      model: response.model,
      usage: response.usage,
    }
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

interface SessionRow {
  id: string
  workspace_id: string
  context: OnboardingContext
  messages: OnboardingMessage[]
  status: string
}

/**
 * Job: answers the last message of an onboarding session, on Pann's key, within the
 * onboarding credit of the workspace and Pann's monthly cap. `db` uses the secret key.
 */
export async function runOnboarding(
  db: SupabaseClient,
  sessionId: string,
  model: AssistantModel = claudeAssistantModel,
): Promise<string> {
  const { data: session, error } = await db
    .from('onboarding_sessions')
    .select('id, workspace_id, context, messages, status')
    .eq('id', sessionId)
    .maybeSingle<SessionRow>()
  if (error) throw error
  if (!session || session.status !== 'pending') return 'skipped'

  const finish = async (fields: Record<string, unknown>) => {
    const { error: updateError } = await db
      .from('onboarding_sessions')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
    if (updateError) throw updateError
  }

  // Limits of what Pann pays: past them, the review opens with what is there.
  const { data: budget, error: budgetError } = await db
    .rpc('onboarding_budget', { p_workspace_id: session.workspace_id })
    .single<{ workspace_onboarding: number; month_total: number; credit: number; cap: number }>()
  if (budgetError) throw budgetError
  if (
    Number(budget.workspace_onboarding) >= Number(budget.credit) ||
    Number(budget.month_total) >= Number(budget.cap)
  ) {
    await finish({ status: 'done', error: 'onboarding_credit_exhausted' })
    return 'credit_exhausted'
  }
  const { data: keys, error: keysError } = await db.rpc('platform_credentials_for_jobs')
  if (keysError) throw keysError
  const apiKey = ((keys ?? []) as { provider: string; secret: string }[]).find(
    (k) => k.provider === 'anthropic',
  )?.secret
  if (!apiKey) {
    await finish({ status: 'failed', error: 'onboarding_unavailable' })
    return 'no_key'
  }

  // The site is read once, for the first answer only.
  let siteText: string | null = null
  if (
    session.context.url &&
    !session.context.current &&
    !session.messages.some((m) => m.role === 'assistant')
  ) {
    try {
      const page = await fetchText(session.context.url, {
        timeoutMs: 10_000,
        maxBytes: 1024 * 1024,
      })
      siteText = extractArticleText(page.text, SITE_CHARS) || null
    } catch {
      siteText = null
    }
  }

  const result = await model({
    apiKey,
    system: onboardingSystemPrompt(session.context),
    messages: onboardingMessages(session.context, session.messages, siteText),
  })
  if (result.usage) {
    const { error: logError } = await db.from('usage_log').insert({
      workspace_id: session.workspace_id,
      topic_id: null,
      provider: 'anthropic',
      model: result.model ?? ONBOARDING_MODEL,
      operation: 'onboarding',
      units: {
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        prompt_version: ONBOARDING_PROMPT_VERSION,
      },
      cost_usd: claudeCostUsd(result.model ?? ONBOARDING_MODEL, {
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        cache_read_input_tokens: result.usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: result.usage.cache_creation_input_tokens ?? 0,
      }),
      billed_to: 'platform',
    })
    if (logError) throw logError
  }
  if (!result.ok) {
    await finish({ status: 'failed', error: result.error })
    return result.error
  }

  const { output } = result
  const asked = session.messages.filter((m) => m.role === 'assistant').length + 1
  const done = output.done || asked >= MAX_QUESTIONS
  await finish({
    messages: [
      ...session.messages,
      { role: 'assistant', text: output.reply, quick_replies: output.quick_replies.slice(0, 4) },
    ],
    proposal: output.proposal,
    status: done ? 'done' : 'idle',
    error: null,
  })
  return done ? 'done' : 'answered'
}
