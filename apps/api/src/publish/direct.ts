import { errorCode } from '@pann/shared'
import { PRIVATE_HOST, USER_AGENT } from '../lib/fetch-text'
import type { PublishRequest, PublishResult } from './networks'

/**
 * Networks published without a go-between, because their API is open and free:
 * Bluesky (AT Protocol, app password) and Discord (channel webhook). Mastodon is in
 * networks.ts. Checked 2026-11-12.
 */

const failure = (error: string, retry: boolean, invalidCredential = false): PublishResult => ({
  ok: false,
  error,
  retry,
  invalidCredential,
})

async function send(url: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...init.headers },
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return null
  }
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// ---------------------------------------------------------------------------
// Bluesky
// ---------------------------------------------------------------------------

export interface BlueskyAccount {
  /** DID of the account (did:plc:… or did:web:…). */
  did: string
  /** Server that hosts the account (PDS), https. */
  pds: string
  /** App password, created in Bluesky settings: it can post, not change the account. */
  password: string
  handle: string
}

/** An https origin on a public host, or null: the PDS comes from a DID document. */
function publicOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !PRIVATE_HOST.test(url.hostname) ? url.origin : null
  } catch {
    return null
  }
}

/** "@geoffrey.bsky.social", a profile URL… to a bare handle; null if it is not one. */
export function blueskyHandle(input: string): string | null {
  const value = input
    .trim()
    .replace(/^https:\/\/bsky\.app\/profile\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(value) ? value : null
}

/** Handle to DID (public AppView), then DID document to the PDS that hosts it. */
async function resolveAccount(handle: string): Promise<{ did: string; pds: string } | null> {
  const res = await send(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
  )
  if (!res?.ok) return null
  const { did } = (await res.json().catch(() => ({}))) as { did?: string }
  let docUrl: string | null = null
  if (did?.startsWith('did:plc:')) docUrl = `https://plc.directory/${did}`
  else if (did?.startsWith('did:web:')) {
    const host = publicOrigin(`https://${did.slice('did:web:'.length)}`)
    docUrl = host ? `${host}/.well-known/did.json` : null
  }
  if (!did || !docUrl) return null
  const docRes = await send(docUrl)
  if (!docRes?.ok) return null
  const doc = (await docRes.json().catch(() => ({}))) as {
    service?: { id?: string; type?: string; serviceEndpoint?: unknown }[]
  }
  const service = doc.service?.find(
    (s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer',
  )
  const pds = publicOrigin(service?.serviceEndpoint)
  return pds ? { did, pds } : null
}

type Session = { ok: true; accessJwt: string } | { ok: false; result: PublishResult }

/** Opens a session with the app password; the access token lasts long enough for a post. */
async function createSession(
  account: Pick<BlueskyAccount, 'pds' | 'did' | 'password'>,
): Promise<Session> {
  const stop = (result: PublishResult): Session => ({ ok: false, result })
  const res = await send(
    `${account.pds}/xrpc/com.atproto.server.createSession`,
    json({ identifier: account.did, password: account.password }),
  )
  if (!res) return stop(failure(errorCode('provider_error', 'bluesky'), true))
  if (res.status === 401 || res.status === 400)
    return stop(failure(errorCode('invalid_credential', 'bluesky'), false, true))
  if (res.status === 429) return stop(failure(errorCode('rate_limited', 'bluesky'), true))
  if (!res.ok) return stop(failure(errorCode('provider_error', 'bluesky'), true))
  const body = (await res.json().catch(() => ({}))) as { accessJwt?: string }
  return body.accessJwt
    ? { ok: true, accessJwt: body.accessJwt }
    : stop(failure(errorCode('provider_response', 'bluesky'), true))
}

export type BlueskyCheck =
  { ok: true; did: string; pds: string; handle: string } | { ok: false; invalid: boolean }

/** Finds the account behind the handle and proves the app password by opening a session. */
export async function checkBluesky(handle: string, password: string): Promise<BlueskyCheck> {
  const account = await resolveAccount(handle)
  if (!account) return { ok: false, invalid: true }
  const session = await createSession({ ...account, password })
  if (session.ok) return { ok: true, ...account, handle }
  return { ok: false, invalid: !session.result.ok && session.result.invalidCredential === true }
}

/** UTF-8 byte offsets of `part` in `text`: Bluesky facets count bytes, not characters. */
function byteRange(text: string, part: string): { byteStart: number; byteEnd: number } | null {
  const index = text.lastIndexOf(part)
  if (index < 0) return null
  const encoder = new TextEncoder()
  const byteStart = encoder.encode(text.slice(0, index)).length
  return { byteStart, byteEnd: byteStart + encoder.encode(part).length }
}

/**
 * Posts to Bluesky: a session with the app password, then an app.bsky.feed.post record
 * with the language of the post and the link as a facet (a link in the text is not
 * clickable without one).
 */
export async function publishToBluesky(
  account: BlueskyAccount,
  request: PublishRequest & { url: string },
): Promise<PublishResult> {
  const session = await createSession(account)
  if (!session.ok) return session.result
  const range = byteRange(request.content, request.url)
  const record = {
    $type: 'app.bsky.feed.post',
    text: request.content,
    langs: [request.lang],
    createdAt: new Date().toISOString(),
    ...(range
      ? {
          facets: [
            {
              index: range,
              features: [{ $type: 'app.bsky.richtext.facet#link', uri: request.url }],
            },
          ],
        }
      : {}),
  }
  const res = await send(`${account.pds}/xrpc/com.atproto.repo.createRecord`, {
    ...json({ repo: account.did, collection: 'app.bsky.feed.post', record }),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessJwt}` },
  })
  if (!res) return failure(errorCode('provider_error', 'bluesky'), true)
  if (res.status === 401) return failure(errorCode('invalid_credential', 'bluesky'), false, true)
  if (res.status === 429) return failure(errorCode('rate_limited', 'bluesky'), true)
  if (res.status === 400) return failure(errorCode('post_rejected', 'bluesky'), false)
  if (!res.ok) return failure(errorCode('provider_error', 'bluesky'), true)
  const body = (await res.json().catch(() => ({}))) as { uri?: string }
  const rkey = body.uri?.split('/').pop()
  return {
    ok: true,
    external_id: body.uri ?? null,
    url: rkey ? `https://bsky.app/profile/${account.handle}/post/${rkey}` : null,
  }
}

// ---------------------------------------------------------------------------
// Discord
// ---------------------------------------------------------------------------

/** A channel webhook address from Discord, or null. Only Discord hosts are called. */
export function discordWebhookUrl(input: string): string | null {
  const match = input
    .trim()
    .match(
      /^https:\/\/(?:(?:ptb|canary)\.)?(?:discord|discordapp)\.com\/api(?:\/v\d+)?\/webhooks\/(\d+)\/([\w-]+)$/,
    )
  return match ? `https://discord.com/api/webhooks/${match[1]}/${match[2]}` : null
}

export interface DiscordWebhook {
  url: string
  /** Server of the channel, to link to the message once sent. */
  guild_id?: string
}

export type DiscordCheck =
  | { ok: true; name: string; guild_id: string | null; channel_id: string | null }
  | { ok: false; invalid: boolean }

/** Reads the webhook (no token needed beyond its address): proves it exists. */
export async function checkDiscordWebhook(url: string): Promise<DiscordCheck> {
  const res = await send(url)
  if (!res) return { ok: false, invalid: false }
  if (res.status === 401 || res.status === 404) return { ok: false, invalid: true }
  if (!res.ok) return { ok: false, invalid: false }
  const body = (await res.json().catch(() => ({}))) as {
    name?: string
    guild_id?: string
    channel_id?: string
  }
  return {
    ok: true,
    name: body.name ?? 'Discord',
    guild_id: body.guild_id ?? null,
    channel_id: body.channel_id ?? null,
  }
}

/**
 * Sends the post as a message of the webhook's channel. Mentions are switched off: a
 * post quoting "@everyone" must not ping a whole server.
 */
export async function publishToDiscord(
  webhook: DiscordWebhook,
  request: PublishRequest,
): Promise<PublishResult> {
  const res = await send(
    `${webhook.url}?wait=true`,
    json({ content: request.content, allowed_mentions: { parse: [] } }),
  )
  if (!res) return failure(errorCode('provider_error', 'discord'), true)
  if (res.status === 401 || res.status === 404)
    return failure(errorCode('invalid_credential', 'discord'), false, true)
  if (res.status === 429) return failure(errorCode('rate_limited', 'discord'), true)
  if (res.status === 400) return failure(errorCode('post_rejected', 'discord'), false)
  if (!res.ok) return failure(errorCode('provider_error', 'discord'), true)
  const message = (await res.json().catch(() => ({}))) as { id?: string; channel_id?: string }
  return {
    ok: true,
    external_id: message.id ?? null,
    url:
      message.id && message.channel_id && webhook.guild_id
        ? `https://discord.com/channels/${webhook.guild_id}/${message.channel_id}/${message.id}`
        : null,
  }
}
