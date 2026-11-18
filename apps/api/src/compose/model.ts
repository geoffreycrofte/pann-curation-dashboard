import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'
import type { TokenUsage } from '../draft/model'

export type StructuredResult<T> =
  | { ok: true; output: T; usage: TokenUsage; model: string }
  | { ok: false; error: string; usage?: TokenUsage; model?: string }

export interface StructuredCall {
  apiKey: string
  model: string
  effort: 'low' | 'medium' | 'high'
  system: string
  /** Text, or content blocks (an image and its question). */
  content: string | Anthropic.Beta.BetaContentBlockParam[]
  schema: z.ZodType
}

/** The Création calls: one structured call, as the drafting of the news watch. */
export type ComposeModel = <T>(call: StructuredCall) => Promise<StructuredResult<T>>

const usageOf = (usage: Anthropic.Beta.BetaUsage): TokenUsage => ({
  input_tokens: usage.input_tokens,
  output_tokens: usage.output_tokens,
  cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
  cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
})

/**
 * Structured outputs, cached system prompt, and server-side refusal fallback ("default"
 * routing by refusal category), like claudeDraftModel.
 */
export const claudeComposeModel: ComposeModel = async <T>({
  apiKey,
  model,
  effort,
  system,
  content,
  schema,
}: StructuredCall): Promise<StructuredResult<T>> => {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 })
  try {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16_000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
      output_config: { effort, format: betaZodOutputFormat(schema) },
    })
    const usage = usageOf(response.usage)
    if (response.stop_reason === 'refusal')
      return { ok: false, error: 'refusal', usage, model: response.model }
    if (!response.parsed_output)
      return { ok: false, error: 'invalid_output', usage, model: response.model }
    return { ok: true, output: response.parsed_output as T, usage, model: response.model }
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
