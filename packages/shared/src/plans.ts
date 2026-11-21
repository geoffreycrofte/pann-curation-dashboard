/**
 * Offers. The limits of each plan live in the database (public.plans, tuned in the admin
 * space); only their keys are known here.
 * - own_keys: the workspace brings its own keys (AI, search, publishing) and its budgets in dollars;
 * - essential, pro: Pann provides the AI and the search, up to a monthly quota of tokens;
 * - custom: limits negotiated per workspace.
 */
export const PLANS = ['own_keys', 'essential', 'pro', 'custom'] as const
export type Plan = (typeof PLANS)[number]

/**
 * Weighted tokens: a call's cost at $2 per million tokens (the input price of the drafting
 * model), so a drafting token counts more than a triage token. Same rate as
 * private.cost_to_tokens in the database.
 */
export const USD_PER_TOKEN = 2 / 1_000_000

export function costToTokens(costUsd: number): number {
  return Math.round(costUsd / USD_PER_TOKEN)
}

/** Limits of a plan for one workspace; null: no limit, or no tokens (own keys). */
export interface PlanLimits {
  max_topics: number | null
  max_social_accounts: number | null
  monthly_tokens: number | null
}

/** A workspace's plan, its limits and what it used this month. */
export interface WorkspacePlan extends PlanLimits {
  plan: Plan
  topics: number
  month_tokens: number
}
