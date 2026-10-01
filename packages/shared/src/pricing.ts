/**
 * Claude prices in USD per million tokens (checked 2026-10-01, Claude API docs).
 * Used to log the cost of each call in usage_log. Unknown models are logged at 0.
 */
export const CLAUDE_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
}

export function claudeCostUsd(
  model: string,
  usage: { input_tokens: number; output_tokens: number },
): number {
  const price = CLAUDE_PRICING[model]
  if (!price) return 0
  return (usage.input_tokens * price.input + usage.output_tokens * price.output) / 1_000_000
}
