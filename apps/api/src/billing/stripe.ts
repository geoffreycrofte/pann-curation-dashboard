/**
 * Stripe through its REST API (form-encoded), with fetch and Web Crypto: no SDK, so it runs
 * as is on Workers. Only what Glimr needs: Checkout, the customer portal, subscriptions, and
 * the signature of the webhook.
 */
const API = 'https://api.stripe.com/v1'

export type StripeResult<T> =
  { ok: true; data: T } | { ok: false; status: number; error: string; message: string }

/** Nested params in Stripe's form encoding: a[b][0]=c. */
export function formEncode(params: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    const name = prefix ? `${prefix}[${key}]` : key
    if (typeof value === 'object') {
      const entries = Array.isArray(value)
        ? Object.fromEntries(value.map((v, i) => [String(i), v]))
        : (value as Record<string, unknown>)
      out.push(...formEncode(entries, name))
    } else {
      out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`)
    }
  }
  return out
}

export async function stripe<T>(
  key: string,
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, unknown> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<StripeResult<T>> {
  const body = formEncode(params).join('&')
  const url = method === 'GET' && body ? `${API}${path}?${body}` : `${API}${path}`
  const response = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? body : undefined,
  })
  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string; type?: string }
  }
  if (!response.ok)
    return {
      ok: false,
      status: response.status,
      error: json.error?.code ?? json.error?.type ?? 'provider_error',
      message: json.error?.message ?? response.statusText,
    }
  return { ok: true, data: json as T }
}

/** A key that can read the balance is a valid secret key (free, read-only call). */
export async function checkStripeKey(key: string, fetchImpl: typeof fetch = fetch) {
  try {
    const result = await stripe(key, 'GET', '/balance', {}, fetchImpl)
    if (result.ok) return { status: 'ok' as const, detail: null }
    return result.status === 401 || result.status === 403
      ? { status: 'invalid' as const, detail: 'invalid_key' }
      : { status: 'unchecked' as const, detail: 'provider_unreachable' }
  } catch {
    return { status: 'unchecked' as const, detail: 'provider_unreachable' }
  }
}

const encoder = new TextEncoder()

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Checks the Stripe-Signature header: t=timestamp,v1=hex HMAC-SHA256 of "t.payload" with the
 * endpoint's signing secret. Refuses signatures older than `toleranceSec` (replays).
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null | undefined,
  secret: string,
  now = Date.now(),
  toleranceSec = 300,
): Promise<boolean> {
  if (!header) return false
  const parts = header.split(',').map((p) => p.trim().split('=') as [string, string])
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1])
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!Number.isFinite(timestamp) || !signatures.length) return false
  if (Math.abs(now / 1000 - timestamp) > toleranceSec) return false
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(`${timestamp}.${payload}`))
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return signatures.some((s) => timingSafeEqual(s, expected))
}

export interface StripeSubscription {
  id: string
  customer: string
  status: string
  cancel_at_period_end: boolean
  /** Older API versions; newer ones put it on the items. */
  current_period_end?: number
  /** End of the Stripe trial (the rest of Glimr's trial, kept when paying early). */
  trial_end?: number | null
  metadata: Record<string, string>
  items: {
    data: { price: { id: string }; current_period_end?: number }[]
  }
}

/** What Glimr keeps of a subscription's state. */
export type BillingStatus = 'active' | 'past_due' | 'canceled' | 'expired'

export function billingStatusOf(
  sub: Pick<StripeSubscription, 'status' | 'cancel_at_period_end'>,
): BillingStatus | null {
  switch (sub.status) {
    case 'active':
    // A Stripe trial (the rest of Glimr's trial, card given): the person has subscribed.
    case 'trialing':
      return sub.cancel_at_period_end ? 'canceled' : 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
      return 'expired'
    // incomplete: the first payment is not done yet; wait for the next event.
    default:
      return null
  }
}

/** While Stripe's trial runs: its end, when the first payment is taken. */
export function trialEndOf(sub: StripeSubscription): string | null {
  return sub.status === 'trialing' && sub.trial_end
    ? new Date(sub.trial_end * 1000).toISOString()
    : null
}

export function periodEndOf(sub: StripeSubscription): string | null {
  const end = sub.current_period_end ?? sub.items.data[0]?.current_period_end
  return end ? new Date(end * 1000).toISOString() : null
}
