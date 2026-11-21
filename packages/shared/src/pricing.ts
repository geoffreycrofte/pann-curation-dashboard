/**
 * Claude prices in USD per million tokens (checked 2026-10-01, Claude API docs).
 * Cache writes (5-minute TTL) cost 1.25x the input price, cache reads 0.1x.
 * Used to log the cost of each call in usage_log. Unknown models are logged at 0.
 */
export const CLAUDE_PRICING: Record<string, { input: number; output: number }> = {
  // Prompts of 100K tokens or fewer (all of Pann's); above that, $0.50 / $2.50.
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  // Server-side refusal fallback for Sonnet 5.5 (same prices).
  'claude-sonnet-5': { input: 2, output: 10 },
  // Onboarding conversation, paid by Pann (checked 2026-11-18, Claude API models table),
  // and the models a refused request may fall back to.
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
}

export function claudeCostUsd(
  model: string,
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  },
): number {
  const price = CLAUDE_PRICING[model]
  if (!price) return 0
  const input =
    usage.input_tokens * price.input +
    (usage.cache_creation_input_tokens ?? 0) * price.input * 1.25 +
    (usage.cache_read_input_tokens ?? 0) * price.input * 0.1
  return (input + usage.output_tokens * price.output) / 1_000_000
}
