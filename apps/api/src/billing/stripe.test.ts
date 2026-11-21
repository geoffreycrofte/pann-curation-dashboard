import { describe, expect, it } from 'vitest'
import { billingStatusOf, formEncode, periodEndOf, verifyStripeSignature } from './stripe'

async function sign(payload: string, secret: string, t: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`))
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

describe('formEncode', () => {
  it('encodes nested objects and arrays the way Stripe reads them', () => {
    expect(
      formEncode({
        mode: 'subscription',
        line_items: [{ price: 'price_1', quantity: 1 }],
        metadata: { workspace_id: 'w 1' },
        customer: undefined,
      }).join('&'),
    ).toBe(
      'mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Bworkspace_id%5D=w%201',
    )
  })
})

describe('verifyStripeSignature', () => {
  const secret = 'whsec_test'
  const payload = '{"type":"customer.subscription.updated"}'
  const now = 1_800_000_000_000
  const t = now / 1000

  it('accepts a fresh signature from the endpoint secret', async () => {
    const v1 = await sign(payload, secret, t)
    expect(await verifyStripeSignature(payload, `t=${t},v1=${v1}`, secret, now)).toBe(true)
  })

  it('refuses another secret, a changed payload, an old signature or no header', async () => {
    const v1 = await sign(payload, secret, t)
    expect(await verifyStripeSignature(payload, `t=${t},v1=${v1}`, 'whsec_other', now)).toBe(false)
    expect(await verifyStripeSignature(`${payload} `, `t=${t},v1=${v1}`, secret, now)).toBe(false)
    expect(await verifyStripeSignature(payload, `t=${t},v1=${v1}`, secret, now + 10 * 60_000)).toBe(
      false,
    )
    expect(await verifyStripeSignature(payload, null, secret, now)).toBe(false)
  })
})

describe('billingStatusOf', () => {
  it('maps Stripe statuses to what Pann keeps', () => {
    expect(billingStatusOf({ status: 'active', cancel_at_period_end: false })).toBe('active')
    expect(billingStatusOf({ status: 'trialing', cancel_at_period_end: false })).toBe('active')
    expect(billingStatusOf({ status: 'active', cancel_at_period_end: true })).toBe('canceled')
    expect(billingStatusOf({ status: 'past_due', cancel_at_period_end: false })).toBe('past_due')
    expect(billingStatusOf({ status: 'canceled', cancel_at_period_end: false })).toBe('expired')
    expect(billingStatusOf({ status: 'incomplete', cancel_at_period_end: false })).toBeNull()
  })

  it('reads the period end on the subscription or, in newer versions, on its item', () => {
    const base = {
      id: 's',
      customer: 'c',
      status: 'active',
      cancel_at_period_end: false,
      metadata: {},
    }
    expect(periodEndOf({ ...base, current_period_end: 1_800_000_000, items: { data: [] } })).toBe(
      '2027-01-15T08:00:00.000Z',
    )
    expect(
      periodEndOf({
        ...base,
        items: { data: [{ price: { id: 'p' }, current_period_end: 1_800_000_000 }] },
      }),
    ).toBe('2027-01-15T08:00:00.000Z')
  })
})
