/**
 * Offers. The limits of each plan live in the database (public.plans, tuned in the admin
 * space); only their keys are known here.
 * - own_keys: the workspace brings its own keys (AI, search, publishing) and its budgets in dollars;
 * - essential, pro: Glimr provides the AI and the search, up to a monthly quota of tokens;
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

export const BILLING_STATUSES = [
  'legacy',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired',
] as const
export type BillingStatus = (typeof BILLING_STATUSES)[number]
export type BillingInterval = 'month' | 'year'

/** A workspace's plan, its limits, what it used this month and where its payment stands. */
export interface WorkspacePlan extends PlanLimits {
  plan: Plan
  topics: number
  month_tokens: number
  /** legacy: created before billing, keeps its access. */
  billing_status: BillingStatus
  trial_ends_at: string | null
  /** When the owner chose the offer (null: not yet, the onboarding asks). */
  plan_chosen_at: string | null
  billing_interval: BillingInterval | null
  current_period_end: string | null
  /** Runs (collects, drafts, publishes): false once a trial or a subscription has ended. */
  active: boolean
  /** Pays through Stripe: the offer changes in the customer portal. */
  subscribed: boolean
}

/** An offer as the pricing page shows it. */
export interface PublicPlan extends PlanLimits {
  key: Plan
  /** Euros, excluding VAT (added at checkout); null: not sold that way. */
  price_month_eur: number | null
  price_year_eur: number | null
  trial_tokens: number | null
}

/** Offers a person can pick (custom is negotiated with Glimr). */
export const SELF_SERVE_PLANS = ['own_keys', 'essential', 'pro'] as const satisfies readonly Plan[]

/** Days left in a trial, rounded up (0 once over). */
export function trialDaysLeft(trialEndsAt: string | null, now = new Date()): number {
  if (!trialEndsAt) return 0
  return Math.max(0, Math.ceil((Date.parse(trialEndsAt) - now.getTime()) / 86_400_000))
}
