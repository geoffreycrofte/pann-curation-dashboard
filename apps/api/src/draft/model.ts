import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { DraftChannel } from '@pann/shared'
import { draftOutputSchema, type DraftOutput } from './prompt'

export interface DraftCall {
  apiKey: string
  model: string
  effort: 'low' | 'medium' | 'high'
  system: string
  user: string
  /** Channels to write a post for. */
  channels: readonly DraftChannel[]
}

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type DraftResult =
  | { ok: true; output: DraftOutput; usage: TokenUsage; model: string }
  | {
      ok: false
      error: 'invalid_credential' | 'rate_limited' | 'refusal' | 'invalid_output' | 'provider_error'
      usage?: TokenUsage
      model?: string
    }

export type DraftModel = (call: DraftCall) => Promise<DraftResult>

function usageOf(usage: Anthropic.Beta.BetaUsage): TokenUsage {
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
  }
}

/**
 * One drafting call: structured outputs, cached system prompt (identical for every item
 * of a topic), and server-side refusal fallback ("default" routing by refusal category).
 */
export const claudeDraftModel: DraftModel = async ({
  apiKey,
  model,
  effort,
  system,
  user,
  channels,
}) => {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 })
  try {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16_000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: { effort, format: betaZodOutputFormat(draftOutputSchema(channels)) },
    })
    const usage = usageOf(response.usage)
    if (response.stop_reason === 'refusal')
      return { ok: false, error: 'refusal', usage, model: response.model }
    if (!response.parsed_output)
      return { ok: false, error: 'invalid_output', usage, model: response.model }
    // The model that actually answered (a fallback may have served the request).
    return {
      ok: true,
      output: response.parsed_output as DraftOutput,
      usage,
      model: response.model,
    }
  } catch (err) {
    if (
      err instanceof Anthropic.AuthenticationError ||
      err instanceof Anthropic.PermissionDeniedError
    ) {
      return { ok: false, error: 'invalid_credential' }
    }
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: 'rate_limited' }
    if (err instanceof Anthropic.APIError) return { ok: false, error: 'provider_error' }
    throw err
  }
}
