import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { engagementOutputSchema, type EngagementOutput } from './prompt'

export type EngagementResult =
  | { ok: true; output: EngagementOutput; usage: { input_tokens: number; output_tokens: number } }
  | { ok: false; error: string; usage?: { input_tokens: number; output_tokens: number } }

/** One assessment, with structured outputs: the answer matches the schema. */
export type EngagementModel = (call: {
  apiKey: string
  model: string
  system: string
  user: string
}) => Promise<EngagementResult>

export const claudeEngagementModel: EngagementModel = async ({ apiKey, model, system, user }) => {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 })
  try {
    const response = await client.messages.parse({
      model,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { format: zodOutputFormat(engagementOutputSchema) },
    })
    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    }
    if (response.stop_reason === 'refusal') return { ok: false, error: 'refusal', usage }
    if (!response.parsed_output) return { ok: false, error: 'invalid_output', usage }
    return { ok: true, output: response.parsed_output, usage }
  } catch (err) {
    if (
      err instanceof Anthropic.AuthenticationError ||
      err instanceof Anthropic.PermissionDeniedError
    )
      return { ok: false, error: 'invalid_credential' }
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: 'rate_limited' }
    if (err instanceof Anthropic.APIError) return { ok: false, error: 'provider_error' }
    throw err
  }
}
