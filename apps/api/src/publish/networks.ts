import {
  errorCode,
  ZERNIO_PLATFORMS,
  type DraftChannel,
  type Lang,
  type ZernioAccount,
  type ZernioChannel,
} from '@pann/shared'
import { USER_AGENT } from '../lib/fetch-text'

/** Checked 2026-10-02 on docs.zernio.com. */
export const ZERNIO_API = 'https://zernio.com/api/v1'

export type PublishResult =
  | { ok: true; external_id: string | null; url: string | null }
  /** retry: a later attempt may work (network down, rate limit, provider error). */
  | { ok: false; error: string; retry: boolean; invalidCredential?: boolean }

export interface PublishRequest {
  channel: DraftChannel
  lang: Lang
  /** Full text: body, blank line, link. */
  content: string
  /** Same key for the retries of one attempt: a lost answer is not published twice. */
  idempotencyKey: string
}

const failure = (error: string, retry: boolean, invalidCredential = false): PublishResult => ({
  ok: false,
  error,
  retry,
  invalidCredential,
})

async function send(url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
  } catch {
    return null
  }
}

interface ZernioPlatformEntry {
  platform?: string
  status?: string
  platformPostUrl?: string
  errorCategory?: string
}

/** Zernio error categories that a new attempt with the same content cannot fix. */
const ZERNIO_DISCONNECTED = new Set(['auth_expired', 'account_issue'])
const ZERNIO_REJECTED = new Set(['user_content', 'platform_rejected', 'user_abuse'])

const zernioHeaders = (apiKey: string) => ({
  Authorization: `Bearer ${apiKey}`,
  'User-Agent': USER_AGENT,
})

/**
 * Discord: the channel an account posts to (platformSpecificData.channelId is required,
 * one connected account serves one channel). Read at publish time, so a channel switched
 * in Zernio is followed.
 */
async function discordChannelId(apiKey: string, accountId: string): Promise<string | null> {
  const res = await send(
    `${ZERNIO_API}/accounts/${encodeURIComponent(accountId)}/discord-settings`,
    {
      headers: zernioHeaders(apiKey),
    },
  )
  if (!res?.ok) return null
  const body = (await res.json().catch(() => ({}))) as { account?: { channelId?: string } }
  return body.account?.channelId ?? null
}

/**
 * LinkedIn, Bluesky, X, Facebook (a Page) and Discord, published now through Zernio.
 * A post that fails on the network still answers 2xx (207): the outcome is read on the
 * platform entry. Checked 2026-11-11 on docs.zernio.com.
 */
export async function publishWithZernio(
  apiKey: string,
  accountId: string,
  request: PublishRequest,
): Promise<PublishResult> {
  const platform = ZERNIO_PLATFORMS[request.channel as ZernioChannel]
  if (!platform) return failure(errorCode('post_rejected', request.channel), false)
  const entry: Record<string, unknown> = { platform, accountId }
  if (request.channel === 'discord') {
    const channelId = await discordChannelId(apiKey, accountId)
    if (!channelId) return failure(errorCode('account_disconnected', request.channel), false)
    entry.platformSpecificData = { channelId }
  }
  const res = await send(`${ZERNIO_API}/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': request.idempotencyKey,
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      content: request.content,
      platforms: [entry],
      publishNow: true,
    }),
  })
  if (!res) return failure(errorCode('provider_error', 'zernio'), true)
  const body = (await res.json().catch(() => ({}))) as {
    post?: { _id?: string; status?: string; platforms?: ZernioPlatformEntry[] }
    details?: { existingPostId?: string }
  }

  if (res.status === 401 || res.status === 403)
    return failure(errorCode('invalid_credential', 'zernio'), false, true)
  if (res.status === 429) return failure(errorCode('rate_limited', 'zernio'), true)
  // Same content already published to this account in the last 24 hours: ours.
  if (res.status === 409)
    return { ok: true, external_id: body.details?.existingPostId ?? null, url: null }
  if (res.status === 404) return failure(errorCode('account_disconnected', request.channel), false)
  if (res.status === 400 || res.status === 422)
    return failure(errorCode('post_rejected', request.channel), false)
  if (!res.ok) return failure(errorCode('provider_error', 'zernio'), true)

  const post = body.post
  const result = post?.platforms?.find((p) => p.platform === platform) ?? post?.platforms?.[0]
  if (result?.status === 'failed' || post?.status === 'failed') {
    const category = result?.errorCategory ?? ''
    if (ZERNIO_DISCONNECTED.has(category))
      return failure(errorCode('account_disconnected', request.channel), false)
    if (ZERNIO_REJECTED.has(category))
      return failure(errorCode('post_rejected', request.channel), false)
    return failure(errorCode('provider_error', 'zernio'), true)
  }
  return { ok: true, external_id: post?._id ?? null, url: result?.platformPostUrl ?? null }
}

export interface MastodonAccount {
  /** Base URL of the instance, e.g. https://mastodon.social. */
  instance: string
  token: string
}

/** Mastodon REST API (POST /api/v1/statuses, scope write:statuses). */
export async function publishToMastodon(
  account: MastodonAccount,
  request: PublishRequest,
): Promise<PublishResult> {
  const res = await send(`${account.instance}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': request.idempotencyKey,
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ status: request.content, language: request.lang, visibility: 'public' }),
  })
  if (!res) return failure(errorCode('provider_error', 'mastodon'), true)
  if (res.status === 401 || res.status === 403)
    return failure(errorCode('invalid_credential', 'mastodon'), false, true)
  if (res.status === 429) return failure(errorCode('rate_limited', 'mastodon'), true)
  if (res.status === 422) return failure(errorCode('post_rejected', 'mastodon'), false)
  if (!res.ok) return failure(errorCode('provider_error', 'mastodon'), true)
  const status = (await res.json().catch(() => ({}))) as { id?: string; url?: string }
  return { ok: true, external_id: status.id ?? null, url: status.url ?? null }
}

// ---------------------------------------------------------------------------
// Account discovery (credential check and refresh)
// ---------------------------------------------------------------------------

export type AccountsResult =
  { ok: true; accounts: ZernioAccount[] } | { ok: false; invalid: boolean }

/** Social accounts connected in Zernio, limited to the networks Pann publishes to. */
export async function listZernioAccounts(apiKey: string): Promise<AccountsResult> {
  const res = await send(`${ZERNIO_API}/accounts`, {
    headers: zernioHeaders(apiKey),
  })
  if (!res) return { ok: false, invalid: false }
  if (res.status === 401 || res.status === 403) return { ok: false, invalid: true }
  if (!res.ok) return { ok: false, invalid: false }
  const body = (await res.json().catch(() => ({}))) as {
    accounts?: {
      _id?: string
      platform?: string
      username?: string
      displayName?: string
      isActive?: boolean
    }[]
  }
  // Zernio's platform name to Pann's channel (X is "twitter" at Zernio).
  const channelOf = new Map(
    Object.entries(ZERNIO_PLATFORMS).map(([channel, platform]) => [platform, channel]),
  ) as Map<string, ZernioChannel>
  const accounts = (body.accounts ?? []).flatMap((a): ZernioAccount[] => {
    const channel = a.platform ? channelOf.get(a.platform) : undefined
    if (!a._id || !channel) return []
    return [
      {
        id: a._id,
        platform: channel,
        // Discord: "Server - #channel" says where the posts go better than the channel name.
        username: (channel === 'discord' ? a.displayName : a.username) ?? a.username ?? a._id,
        active: a.isActive !== false,
      },
    ]
  })
  return { ok: true, accounts }
}

export type MastodonCheck =
  { ok: true; acct: string; max_characters: number | null } | { ok: false; invalid: boolean }

/** Who the token belongs to, and the post length limit of the instance. */
export async function checkMastodon(account: MastodonAccount): Promise<MastodonCheck> {
  const res = await send(`${account.instance}/api/v1/accounts/verify_credentials`, {
    headers: { Authorization: `Bearer ${account.token}`, 'User-Agent': USER_AGENT },
  })
  if (!res) return { ok: false, invalid: false }
  if (res.status === 401 || res.status === 403) return { ok: false, invalid: true }
  if (!res.ok) return { ok: false, invalid: false }
  const me = (await res.json().catch(() => ({}))) as { acct?: string }
  const host = new URL(account.instance).host
  const acct = me.acct ? (me.acct.includes('@') ? me.acct : `${me.acct}@${host}`) : host

  const info = await send(`${account.instance}/api/v2/instance`, {
    headers: { 'User-Agent': USER_AGENT },
  })
  const instance = info?.ok
    ? ((await info.json().catch(() => ({}))) as {
        configuration?: { statuses?: { max_characters?: number } }
      })
    : {}
  const max = instance.configuration?.statuses?.max_characters
  return { ok: true, acct, max_characters: typeof max === 'number' && max > 0 ? max : null }
}
