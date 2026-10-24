import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { triageOutputSchema, type TriageOutput } from './prompt'

export interface TriageCall {
  apiKey: string
  model: string
  system: string
  user: string
}

export type TriageResult =
  | { ok: true; output: TriageOutput; usage: { input_tokens: number; output_tokens: number } }
  | {
      ok: false
      /** invalid_credential, rate_limited, refusal, invalid_output, provider_error */
      error: string
      usage?: { input_tokens: number; output_tokens: number }
    }

/** One triage call with structured outputs: the answer is guaranteed to match the schema. */
export type TriageModel = (call: TriageCall) => Promise<TriageResult>

export const claudeTriageModel: TriageModel = async ({ apiKey, model, system, user }) => {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 })
  try {
    const response = await client.messages.parse({
      model,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { format: zodOutputFormat(triageOutputSchema) },
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
    ) {
      return { ok: false, error: 'invalid_credential' }
    }
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: 'rate_limited' }
    if (err instanceof Anthropic.APIError) return { ok: false, error: 'provider_error' }
    throw err
  }
}
