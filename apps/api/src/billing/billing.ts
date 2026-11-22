import type { SupabaseClient } from '@supabase/supabase-js'
import {
  billingStatusOf,
  periodEndOf,
  stripe,
  verifyStripeSignature,
  type StripeSubscription,
} from './stripe'

/** Pann's Stripe keys, from Vault. `db` must use the secret key (jobs, webhook). */
export async function stripeKeys(db: SupabaseClient) {
  const { data, error } = await db.rpc('platform_credentials_for_jobs')
  if (error) throw error
  const rows = (data ?? []) as { provider: string; secret: string }[]
  return {
    secret: rows.find((r) => r.provider === 'stripe')?.secret,
    webhook: rows.find((r) => r.provider === 'stripe_webhook')?.secret,
  }
}

interface RequestRow {
  id: string
  workspace_id: string
  kind: 'checkout' | 'portal'
  plan: string | null
  billing_interval: 'month' | 'year' | null
  return_url: string
  status: string
  created_by: string | null
  workspace: {
    billing_status: string
    trial_ends_at: string | null
    stripe_customer_id: string | null
  }
}

interface PlanRow {
  key: string
  stripe_price_month: string
  stripe_price_year: string
}

/** The person's return to the board, with the outcome in the address. */
function withOutcome(url: string, outcome: string): string {
  const u = new URL(url)
  u.searchParams.set('billing', outcome)
  return u.toString()
}

/**
 * Job: opens the Stripe page the person asked for (subscribe to an offer, or manage the
 * subscription) with Pann's key, and stores its address on the request.
 */
export async function runBillingRequest(db: SupabaseClient, id: string, fetchImpl = fetch) {
  const { data: row, error } = await db
    .from('billing_requests')
    .select(
      'id, workspace_id, kind, plan, billing_interval, return_url, status, created_by, ' +
        'workspace:workspaces!inner (billing_status, trial_ends_at, stripe_customer_id)',
    )
    .eq('id', id)
    .maybeSingle<RequestRow>()
  if (error) throw error
  if (!row || row.status !== 'pending') return

  const finish = async (patch: { url?: string; error?: string }) => {
    const { error: updateError } = await db
      .from('billing_requests')
      .update(
        patch.url
          ? { status: 'ready', url: patch.url }
          : { status: 'failed', error: patch.error ?? 'provider_error' },
      )
      .eq('id', id)
    if (updateError) throw updateError
  }

  const { secret } = await stripeKeys(db)
  if (!secret) return finish({ error: 'billing_not_configured' })

  if (row.kind === 'portal') {
    if (!row.workspace.stripe_customer_id) return finish({ error: 'billing_not_configured' })
    const portal = await stripe<{ url: string }>(
      secret,
      'POST',
      '/billing_portal/sessions',
      { customer: row.workspace.stripe_customer_id, return_url: row.return_url },
      fetchImpl,
    )
    return portal.ok ? finish({ url: portal.data.url }) : finish({ error: 'provider_error' })
  }

  const { data: plan, error: planError } = await db
    .from('plans')
    .select('key, stripe_price_month, stripe_price_year')
    .eq('key', row.plan ?? '')
    .maybeSingle<PlanRow>()
  if (planError) throw planError
  const price = row.billing_interval === 'year' ? plan?.stripe_price_year : plan?.stripe_price_month
  if (!price) return finish({ error: 'billing_not_configured' })

  let email: string | undefined
  if (!row.workspace.stripe_customer_id && row.created_by) {
    const { data: user } = await db.auth.admin.getUserById(row.created_by)
    email = user.user?.email ?? undefined
  }

  // Paying during the trial keeps its remaining days (Stripe wants at least 2 days ahead).
  const trialEnd =
    row.workspace.billing_status === 'trialing' && row.workspace.trial_ends_at
      ? Math.floor(Date.parse(row.workspace.trial_ends_at) / 1000)
      : null
  const keepTrial = trialEnd !== null && trialEnd > Date.now() / 1000 + 2 * 86400

  const metadata = {
    workspace_id: row.workspace_id,
    plan: row.plan,
    interval: row.billing_interval,
  }
  const session = await stripe<{ url: string }>(
    secret,
    'POST',
    '/checkout/sessions',
    {
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      client_reference_id: row.workspace_id,
      customer: row.workspace.stripe_customer_id ?? undefined,
      customer_email: row.workspace.stripe_customer_id ? undefined : email,
      success_url: withOutcome(row.return_url, 'success'),
      cancel_url: withOutcome(row.return_url, 'cancel'),
      allow_promotion_codes: true,
      locale: 'auto',
      metadata,
      subscription_data: { metadata, ...(keepTrial ? { trial_end: trialEnd } : {}) },
    },
    fetchImpl,
  )
  return session.ok ? finish({ url: session.data.url }) : finish({ error: 'provider_error' })
}

interface StripeEvent {
  type: string
  data: { object: Record<string, unknown> }
}

/** The offer and the period of a Stripe price, from the offers' price ids. */
async function planOfPrice(db: SupabaseClient, priceId: string | undefined) {
  if (!priceId) return null
  const { data, error } = await db
    .from('plans')
    .select('key, stripe_price_month, stripe_price_year')
    .or(`stripe_price_month.eq.${priceId},stripe_price_year.eq.${priceId}`)
    .returns<PlanRow[]>()
  if (error) throw error
  const plan = data[0]
  if (!plan) return null
  return { plan: plan.key, interval: plan.stripe_price_year === priceId ? 'year' : 'month' }
}

async function applySubscription(
  db: SupabaseClient,
  sub: StripeSubscription,
  deleted = false,
): Promise<string> {
  let workspaceId = sub.metadata?.workspace_id
  if (!workspaceId) {
    const { data } = await db
      .from('workspaces')
      .select('id')
      .eq('stripe_customer_id', sub.customer)
      .maybeSingle<{ id: string }>()
    workspaceId = data?.id
  }
  if (!workspaceId) return 'unknown_workspace'
  const status = deleted ? 'expired' : billingStatusOf(sub)
  if (!status) return 'ignored'
  // The price says the offer, also after a change in the customer portal.
  const fromPrice = await planOfPrice(db, sub.items.data[0]?.price.id)
  const { error } = await db.rpc('apply_billing_for_jobs', {
    p_workspace_id: workspaceId,
    p_status: status,
    p_plan: fromPrice?.plan ?? sub.metadata?.plan ?? null,
    p_interval: fromPrice?.interval ?? sub.metadata?.interval ?? null,
    p_customer: sub.customer,
    p_subscription: sub.id,
    p_period_end: periodEndOf(sub),
  })
  if (error) throw error
  return status
}

/**
 * Stripe's webhook: checks the signature, then applies the subscription's state to its
 * workspace. Returns what was done, for the logs. Events can repeat: applying is idempotent.
 */
export async function handleStripeWebhook(
  db: SupabaseClient,
  payload: string,
  signature: string | null,
  fetchImpl = fetch,
): Promise<{ status: number; outcome: string }> {
  const { secret, webhook } = await stripeKeys(db)
  if (!secret || !webhook) return { status: 503, outcome: 'billing_not_configured' }
  if (!(await verifyStripeSignature(payload, signature, webhook)))
    return { status: 400, outcome: 'bad_signature' }
  const event = JSON.parse(payload) as StripeEvent
  const object = event.data.object

  switch (event.type) {
    case 'checkout.session.completed': {
      const subscriptionId = object.subscription as string | null
      if (!subscriptionId) return { status: 200, outcome: 'no_subscription' }
      const sub = await stripe<StripeSubscription>(
        secret,
        'GET',
        `/subscriptions/${subscriptionId}`,
        {},
        fetchImpl,
      )
      if (!sub.ok) return { status: 500, outcome: 'provider_error' }
      return { status: 200, outcome: await applySubscription(db, sub.data) }
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return { status: 200, outcome: await applySubscription(db, object as never) }
    case 'customer.subscription.deleted':
      return { status: 200, outcome: await applySubscription(db, object as never, true) }
    default:
      return { status: 200, outcome: 'ignored' }
  }
}
