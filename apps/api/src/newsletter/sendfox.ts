import { errorCode, type NewsletterList } from '@pann/shared'
import { USER_AGENT } from '../lib/fetch-text'
import type { Campaign, CampaignResult } from './send'

/**
 * Checked 2026-11-11 on sendfox.com/developer/docs (API 1.6.0): a personal access token
 * in `Authorization: Bearer`, campaigns created as drafts then sent, 60 requests a minute.
 */
export const SENDFOX_API = 'https://api.sendfox.com'

async function call(token: string, path: string, init: RequestInit = {}) {
  try {
    return await fetch(`${SENDFOX_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
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

export type SendfoxAccount =
  | { ok: true; lists: NewsletterList[] }
  | { ok: false; detail: 'invalid_key' | 'provider_unreachable' }

/** Contact lists of the account; also proves that the token works (GET /me). */
export async function readSendfoxAccount(token: string): Promise<SendfoxAccount> {
  const me = await call(token, '/me')
  if (!me) return { ok: false, detail: 'provider_unreachable' }
  if (me.status === 401 || me.status === 403) return { ok: false, detail: 'invalid_key' }
  if (!me.ok) return { ok: false, detail: 'provider_unreachable' }

  const lists: NewsletterList[] = []
  for (let page = 1; page <= 10; page++) {
    const res = await call(token, `/lists?page=${page}`)
    if (!res?.ok) return { ok: false, detail: 'provider_unreachable' }
    const body = (await res.json().catch(() => ({}))) as {
      data?: { id?: number; name?: string; subscribed_contacts_count?: number }[]
      per_page?: number
      total?: number
    }
    for (const l of body.data ?? [])
      if (typeof l.id === 'number')
        lists.push({
          id: l.id,
          name: l.name ?? `#${l.id}`,
          subscribers: l.subscribed_contacts_count ?? null,
        })
    if (!body.data?.length || lists.length >= (body.total ?? 0)) break
  }
  return { ok: true, lists }
}

async function failed(res: Response | null): Promise<CampaignResult | null> {
  if (!res) return { ok: false, error: errorCode('provider_error', 'sendfox') }
  if (res.ok) return null
  if (res.status === 401)
    return { ok: false, error: errorCode('invalid_credential', 'sendfox'), invalidCredential: true }
  if (res.status === 429) return { ok: false, error: errorCode('rate_limited', 'sendfox') }
  if (res.status >= 500) return { ok: false, error: errorCode('provider_error', 'sendfox') }
  // 403 (no subscription, warm-up period), 409, 422: SendFox refused this campaign.
  return { ok: false, error: errorCode('provider_response', 'sendfox') }
}

/**
 * Creates the campaign as a draft, addressed to the list, then sends it now. The sender
 * is the default one of the SendFox account. A created campaign is reported even on
 * failure.
 */
export async function sendSendfoxCampaign(
  token: string,
  campaign: Campaign,
  existingId?: number,
): Promise<CampaignResult> {
  let campaignId = existingId
  if (!campaignId) {
    const res = await call(token, '/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        title: campaign.name,
        subject: campaign.subject,
        html: campaign.html,
        lists: [campaign.listId],
        // The issue goes by email only; Pann's public feeds publish on the web.
        web_publish: false,
      }),
    })
    const failure = await failed(res)
    if (failure) return failure
    const body = (await res!.json().catch(() => ({}))) as { id?: number }
    if (typeof body.id !== 'number')
      return { ok: false, error: errorCode('provider_response', 'sendfox') }
    campaignId = body.id
  }

  const res = await call(token, `/campaigns/${campaignId}/send`, { method: 'POST' })
  const failure = await failed(res)
  if (failure) return { ...failure, campaignId }
  return { ok: true, campaignId }
}
