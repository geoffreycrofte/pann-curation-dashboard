import { errorCode, type BrevoList, type BrevoSender } from '@pann/shared'
import { USER_AGENT } from '../lib/fetch-text'

/** Checked 2026-10-02 on developers.brevo.com. */
export const BREVO_API = 'https://api.brevo.com/v3'

async function call(apiKey: string, path: string, init: RequestInit = {}) {
  try {
    return await fetch(`${BREVO_API}${path}`, {
      ...init,
      headers: {
        'api-key': apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        ...init.headers,
      },
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return null
  }
}

/** Brevo answers 401 both for a wrong key and for a call from an IP it does not know. */
async function rejection(res: Response): Promise<'invalid_key' | 'ip_not_authorized'> {
  const body = (await res.json().catch(() => ({}))) as { message?: string }
  return /\bIP\b/i.test(body.message ?? '') ? 'ip_not_authorized' : 'invalid_key'
}

export type BrevoAccount =
  | { ok: true; lists: BrevoList[]; senders: BrevoSender[] }
  | { ok: false; detail: 'invalid_key' | 'ip_not_authorized' | 'provider_unreachable' }

/** Contact lists and senders of the account; also proves that the key works. */
export async function readBrevoAccount(apiKey: string): Promise<BrevoAccount> {
  const lists: BrevoList[] = []
  for (let offset = 0; offset < 500; offset += 50) {
    const res = await call(apiKey, `/contacts/lists?limit=50&offset=${offset}`)
    if (!res) return { ok: false, detail: 'provider_unreachable' }
    if (res.status === 401 || res.status === 403) return { ok: false, detail: await rejection(res) }
    if (!res.ok) return { ok: false, detail: 'provider_unreachable' }
    const page = (await res.json().catch(() => ({}))) as {
      lists?: { id?: number; name?: string; totalSubscribers?: number }[]
      count?: number
    }
    for (const l of page.lists ?? [])
      if (typeof l.id === 'number')
        lists.push({
          id: l.id,
          name: l.name ?? `#${l.id}`,
          subscribers: l.totalSubscribers ?? null,
        })
    if ((page.lists?.length ?? 0) < 50 || lists.length >= (page.count ?? 0)) break
  }

  const res = await call(apiKey, '/senders')
  if (!res || !res.ok) return { ok: false, detail: 'provider_unreachable' }
  const body = (await res.json().catch(() => ({}))) as {
    senders?: { id?: number; name?: string; email?: string; active?: boolean }[]
  }
  const senders = (body.senders ?? []).flatMap((s): BrevoSender[] =>
    typeof s.id === 'number' && s.email
      ? [{ id: s.id, name: s.name ?? s.email, email: s.email, active: s.active !== false }]
      : [],
  )
  return { ok: true, lists, senders }
}

export interface Campaign {
  /** Internal name, shown in Brevo only. */
  name: string
  subject: string
  senderId: number
  listId: number
  html: string
}

export type CampaignResult =
  | { ok: true; campaignId: number }
  | { ok: false; error: string; invalidCredential?: boolean; campaignId?: number }

/** Creates the campaign, then sends it now. A created campaign is reported even on failure. */
export async function sendBrevoCampaign(
  apiKey: string,
  campaign: Campaign,
  existingId?: number,
): Promise<CampaignResult> {
  let campaignId = existingId
  if (!campaignId) {
    const res = await call(apiKey, '/emailCampaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: campaign.name,
        subject: campaign.subject,
        sender: { id: campaign.senderId },
        htmlContent: campaign.html,
        recipients: { listIds: [campaign.listId] },
      }),
    })
    const failure = await failed(res)
    if (failure) return failure
    const body = (await res!.json().catch(() => ({}))) as { id?: number }
    if (typeof body.id !== 'number')
      return { ok: false, error: errorCode('provider_response', 'brevo') }
    campaignId = body.id
  }

  const res = await call(apiKey, `/emailCampaigns/${campaignId}/sendNow`, { method: 'POST' })
  const failure = await failed(res)
  if (failure) return { ...failure, campaignId }
  return { ok: true, campaignId }
}

async function failed(res: Response | null): Promise<CampaignResult | null> {
  if (!res) return { ok: false, error: errorCode('provider_error', 'brevo') }
  if (res.ok) return null
  if (res.status === 401 || res.status === 403)
    return { ok: false, error: errorCode('invalid_credential', 'brevo'), invalidCredential: true }
  if (res.status === 402) return { ok: false, error: errorCode('credits_exhausted', 'brevo') }
  if (res.status === 429) return { ok: false, error: errorCode('rate_limited', 'brevo') }
  if (res.status >= 500) return { ok: false, error: errorCode('provider_error', 'brevo') }
  return { ok: false, error: errorCode('provider_response', 'brevo') }
}
