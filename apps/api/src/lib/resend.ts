import { USER_AGENT } from './fetch-text'

/** Checked 2026-11-17 on resend.com/docs (API reference, errors). */
const RESEND_API = 'https://api.resend.com'

const headers = (key: string) => ({
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  // Resend rejects requests without a User-Agent (403, error 1010).
  'User-Agent': USER_AGENT,
})

/**
 * Checks a Resend key with a free call (list of domains). A key restricted to sending
 * answers `restricted_api_key`: it exists, which is all Pann needs.
 */
export async function checkResendKey(
  key: string,
): Promise<{ status: 'ok' | 'invalid' | 'unchecked'; detail: string | null }> {
  try {
    const res = await fetch(`${RESEND_API}/domains`, { headers: headers(key) })
    if (res.ok) return { status: 'ok', detail: null }
    const body = (await res.json().catch(() => ({}))) as { name?: string }
    if (res.status === 401 && body.name === 'restricted_api_key')
      return { status: 'ok', detail: 'sending_only' }
    if (res.status === 401 || res.status === 403)
      return { status: 'invalid', detail: 'invalid_key' }
    return { status: 'unchecked', detail: 'provider_unreachable' }
  } catch {
    return { status: 'unchecked', detail: 'provider_unreachable' }
  }
}

export interface ServiceEmail {
  from: string
  to: string[]
  subject: string
  text: string
  html: string
  replyTo?: string
  /** Same key on a retry: the email is not sent twice (24 hours at Resend). */
  idempotencyKey: string
}

export type SendResult =
  { ok: true; id: string | null } | { ok: false; error: string; retry: boolean }

/** POST /emails. */
export async function sendResendEmail(key: string, email: ServiceEmail): Promise<SendResult> {
  try {
    const res = await fetch(`${RESEND_API}/emails`, {
      method: 'POST',
      headers: { ...headers(key), 'Idempotency-Key': email.idempotencyKey },
      body: JSON.stringify({
        from: email.from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
    })
    const body = (await res.json().catch(() => ({}))) as { id?: string; name?: string }
    if (res.ok) return { ok: true, id: body.id ?? null }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: 'invalid_credential:resend', retry: false }
    if (res.status === 429) return { ok: false, error: 'rate_limited:resend', retry: true }
    if (res.status >= 500) return { ok: false, error: 'provider_error:resend', retry: true }
    return { ok: false, error: `provider_error:resend`, retry: false }
  } catch {
    return { ok: false, error: 'provider_error:resend', retry: true }
  }
}
