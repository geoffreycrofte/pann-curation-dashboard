import { errorCode } from '@glimr/shared'
import { fetchText, PRIVATE_HOST, USER_AGENT } from '../lib/fetch-text'
import type { PublishImage, PublishRequest, PublishResult } from './networks'

/**
 * Networks published without a go-between, because their API is open and free:
 * Bluesky and W (AT Protocol, app password), Discord (channel webhook), Telegram (bot). Mastodon is in
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

/**
 * The domain a handle gets on each AT network when only the name is typed ("geoffrey"):
 * the PDS's `availableUserDomains` (describeServer, checked 2026-11-25).
 */
export const AT_DEFAULT_DOMAIN = { bluesky: 'bsky.social', w: 'wsocial.eu' } as const

/**
 * "@geoffrey.bsky.social", a profile URL… to a bare handle; null if it is not one. A name
 * without a dot gets `defaultDomain` ("geoffrey" on W is "geoffrey.wsocial.eu").
 */
export function blueskyHandle(input: string, defaultDomain?: string): string | null {
  let value = input
    .trim()
    .replace(/^https:\/\/(bsky\.app|wsocial\.eu)\/profile\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
  if (defaultDomain && /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
    value = `${value}.${defaultDomain}`
  }
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(value) ? value : null
}

/**
 * Handle to DID: Bluesky's public AppView first, then the handle's own
 * /.well-known/atproto-did (AT Protocol handle resolution over HTTPS), which the AppView
 * does not always know (W handles, checked 2026-11-25).
 */
async function resolveDid(handle: string): Promise<string | null> {
  const res = await send(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
  )
  if (res?.ok) {
    const { did } = (await res.json().catch(() => ({}))) as { did?: string }
    if (did) return did
  }
  const host = publicOrigin(`https://${handle}`)
  if (!host) return null
  const wellKnown = await send(`${host}/.well-known/atproto-did`, {
    headers: { Accept: 'text/plain' },
  })
  if (!wellKnown?.ok) return null
  const did = (await wellKnown.text().catch(() => '')).trim()
  return /^did:(plc|web):[\w.:%-]+$/.test(did) ? did : null
}

/** Handle to DID, then DID document to the PDS that hosts it. */
async function resolveAccount(handle: string): Promise<{ did: string; pds: string } | null> {
  const did = await resolveDid(handle)
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

/** Networks on the AT Protocol Glimr publishes to: same records, their own app. */
export type AtNetwork = 'bluesky' | 'w'

/** Where a post can be read: the network's own app (W's follows Bluesky's addresses). */
const POST_APP: Record<AtNetwork, string> = {
  bluesky: 'https://bsky.app',
  w: 'https://wsocial.eu',
}

/** Opens a session with the app password; the access token lasts long enough for a post. */
async function createSession(
  account: Pick<BlueskyAccount, 'pds' | 'did' | 'password'>,
  network: AtNetwork = 'bluesky',
): Promise<Session> {
  const stop = (result: PublishResult): Session => ({ ok: false, result })
  const res = await send(
    `${account.pds}/xrpc/com.atproto.server.createSession`,
    json({ identifier: account.did, password: account.password }),
  )
  if (!res) return stop(failure(errorCode('provider_error', network), true))
  if (res.status === 401 || res.status === 400)
    return stop(failure(errorCode('invalid_credential', network), false, true))
  if (res.status === 429) return stop(failure(errorCode('rate_limited', network), true))
  if (!res.ok) return stop(failure(errorCode('provider_error', network), true))
  const body = (await res.json().catch(() => ({}))) as { accessJwt?: string }
  return body.accessJwt
    ? { ok: true, accessJwt: body.accessJwt }
    : stop(failure(errorCode('provider_response', network), true))
}

export type BlueskyCheck =
  { ok: true; did: string; pds: string; handle: string } | { ok: false; invalid: boolean }

/** Finds the account behind the handle and proves the app password by opening a session. */
export async function checkBluesky(
  handle: string,
  password: string,
  network: AtNetwork = 'bluesky',
): Promise<BlueskyCheck> {
  const account = await resolveAccount(handle)
  if (!account) return { ok: false, invalid: true }
  const session = await createSession({ ...account, password }, network)
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

const decodeEntities = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/** A meta tag of the page (Open Graph first, then the plain one). */
function metaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    const tag = html.match(
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i'),
    )?.[0]
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1]
    if (content?.trim()) return decodeEntities(content.trim())
  }
  return null
}

/** Title, description and image of the linked page, for the card under the post. */
export async function readLinkCard(
  url: string,
): Promise<{ title: string; description: string; image: string | null } | null> {
  try {
    const page = await fetchText(url, { timeoutMs: 8000, maxBytes: 512 * 1024 })
    const html = page.text
    const title =
      metaContent(html, ['og:title', 'twitter:title']) ??
      decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '')
    if (!title) return null
    const description =
      metaContent(html, ['og:description', 'twitter:description', 'description']) ?? ''
    const image = metaContent(html, ['og:image', 'twitter:image'])
    let imageUrl: string | null = null
    try {
      imageUrl = image ? new URL(image, url).toString() : null
    } catch {
      imageUrl = null
    }
    return { title: title.slice(0, 300), description: description.slice(0, 1000), image: imageUrl }
  } catch {
    return null
  }
}

/** The page's image as a blob of the account (1 MB at most), or null: the card goes without. */
async function uploadCardThumb(
  account: BlueskyAccount,
  accessJwt: string,
  imageUrl: string,
): Promise<unknown | null> {
  const origin = publicOrigin(imageUrl)
  if (!origin) return null
  const res = await send(imageUrl, {
    headers: { Accept: 'image/jpeg, image/png, image/webp;q=0.9' },
  })
  const mime = res?.headers.get('content-type')?.split(';')[0] ?? ''
  if (!res?.ok || !/^image\/(jpeg|png|webp|gif)$/.test(mime)) return null
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.length > 1_000_000) return null
  const upload = await send(`${account.pds}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: { 'Content-Type': mime, Authorization: `Bearer ${accessJwt}` },
    body: bytes,
  })
  if (!upload?.ok) return null
  const body = (await upload.json().catch(() => ({}))) as { blob?: unknown }
  return body.blob ?? null
}

/**
 * Hashtags of a post (#WCAG), as tag facets: without one, a hashtag is plain text on the
 * AT Protocol. Byte offsets, like the link's.
 */
export function hashtagFacets(text: string) {
  const encoder = new TextEncoder()
  const facets: {
    index: { byteStart: number; byteEnd: number }
    features: { $type: string; tag: string }[]
  }[] = []
  for (const match of text.matchAll(/(^|\s)#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu)) {
    const start = match.index + match[1]!.length
    const byteStart = encoder.encode(text.slice(0, start)).length
    const tag = match[2]!
    facets.push({
      index: { byteStart, byteEnd: byteStart + encoder.encode(`#${tag}`).length },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag }],
    })
  }
  return facets
}

/**
 * Posts to Bluesky: a session with the app password, then an app.bsky.feed.post record
 * with the language of the post and the link as a facet (a link in the text is not
 * clickable without one).
 */
/**
 * Uploads an image (com.atproto.repo.uploadBlob): the blob it returns goes into the
 * post, with the text alternative and the size (app.bsky.embed.images, 4 at most).
 */
async function uploadBlueskyImage(
  account: BlueskyAccount,
  accessJwt: string,
  image: PublishImage,
  network: AtNetwork,
): Promise<{ blob: unknown } | PublishResult> {
  const res = await send(`${account.pds}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: { 'Content-Type': image.mime, Authorization: `Bearer ${accessJwt}` },
    body: await image.load(),
  })
  if (!res) return failure(errorCode('provider_error', network), true)
  if (res.status === 401) return failure(errorCode('invalid_credential', network), false, true)
  if (res.status === 429) return failure(errorCode('rate_limited', network), true)
  if (res.status === 400 || res.status === 413)
    return failure(errorCode('post_rejected', network), false)
  if (!res.ok) return failure(errorCode('provider_error', network), true)
  const body = (await res.json().catch(() => ({}))) as { blob?: unknown }
  return body.blob ? { blob: body.blob } : failure(errorCode('provider_response', network), true)
}

export async function publishToBluesky(
  account: BlueskyAccount,
  request: PublishRequest & { url: string },
  network: AtNetwork = 'bluesky',
): Promise<PublishResult> {
  const session = await createSession(account, network)
  if (!session.ok) return session.result
  const images: { image: unknown; alt: string; aspectRatio: { width: number; height: number } }[] =
    []
  for (const image of (request.images ?? []).slice(0, 4)) {
    const uploaded = await uploadBlueskyImage(account, session.accessJwt, image, network)
    if ('ok' in uploaded) return uploaded
    images.push({
      image: uploaded.blob,
      alt: image.alt,
      aspectRatio: { width: image.width, height: image.height },
    })
  }
  const range = request.url ? byteRange(request.content, request.url) : null
  const facets = [
    ...(range
      ? [
          {
            index: range,
            features: [{ $type: 'app.bsky.richtext.facet#link', uri: request.url }],
          },
        ]
      : []),
    ...hashtagFacets(request.content),
  ]
  const record = {
    $type: 'app.bsky.feed.post',
    text: request.content,
    langs: [request.lang],
    createdAt: new Date().toISOString(),
    ...(facets.length ? { facets } : {}),
  }
  // Images first; otherwise the link as a card (title, description, image of the page),
  // like the apps show it. A page that cannot be read leaves the plain link.
  let embed: Record<string, unknown> | null = images.length
    ? { $type: 'app.bsky.embed.images', images }
    : null
  if (!embed && request.url) {
    const card = await readLinkCard(request.url)
    if (card) {
      const thumb = card.image
        ? await uploadCardThumb(account, session.accessJwt, card.image)
        : null
      embed = {
        $type: 'app.bsky.embed.external',
        external: {
          uri: request.url,
          title: card.title,
          description: card.description,
          ...(thumb ? { thumb } : {}),
        },
      }
    }
  }
  if (embed) Object.assign(record, { embed })
  const res = await send(`${account.pds}/xrpc/com.atproto.repo.createRecord`, {
    ...json({ repo: account.did, collection: 'app.bsky.feed.post', record }),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessJwt}` },
  })
  if (!res) return failure(errorCode('provider_error', network), true)
  if (res.status === 401) return failure(errorCode('invalid_credential', network), false, true)
  if (res.status === 429) return failure(errorCode('rate_limited', network), true)
  if (res.status === 400) return failure(errorCode('post_rejected', network), false)
  if (!res.ok) return failure(errorCode('provider_error', network), true)
  const body = (await res.json().catch(() => ({}))) as { uri?: string }
  const rkey = body.uri?.split('/').pop()
  return {
    ok: true,
    external_id: body.uri ?? null,
    url: rkey ? `${POST_APP[network]}/profile/${account.handle}/post/${rkey}` : null,
  }
}

/** W (wsocial.eu): the AT Protocol, like Bluesky, on W's own server. */
export const publishToW = (account: BlueskyAccount, request: PublishRequest & { url: string }) =>
  publishToBluesky(account, request, 'w')

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
  const payload = { content: request.content, allowed_mentions: { parse: [] } }
  const images = request.images ?? []
  let init: RequestInit = json(payload)
  if (images.length) {
    // Files with their description (text alternative): multipart, the message in
    // payload_json, each file in files[n] matching attachments[n].
    const form = new FormData()
    const extension = (mime: string) => mime.split('/')[1] ?? 'jpg'
    form.append(
      'payload_json',
      JSON.stringify({
        ...payload,
        attachments: images.map((image, index) => ({
          id: index,
          description: image.alt,
          filename: `image-${index + 1}.${extension(image.mime)}`,
        })),
      }),
    )
    for (const [index, image] of images.entries())
      form.append(
        `files[${index}]`,
        new Blob([await image.load()], { type: image.mime }),
        `image-${index + 1}.${extension(image.mime)}`,
      )
    init = { method: 'POST', body: form }
  }
  const res = await send(`${webhook.url}?wait=true`, init)
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

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

/** Bot API (core.telegram.org/bots/api, checked 2026-11-25). */
const TELEGRAM_API = 'https://api.telegram.org'

/** A channel the bot posts to: its id, and its public name when it has one (for links). */
export interface TelegramChannel {
  token: string
  chat_id: string
  username?: string
}

/**
 * The channel as typed: @name, name, a t.me link, or a numeric id (-100…). Returns @name or
 * the id, or null.
 */
export function telegramChat(input: string): string | null {
  const value = input.trim()
  if (/^-?\d{5,20}$/.test(value)) return value
  const name = value
    .replace(/^https?:\/\/(?:www\.)?(?:t|telegram)\.me\//i, '')
    .replace(/^@/, '')
    .replace(/\/$/, '')
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(name) ? `@${name}` : null
}

interface TelegramReply<T> {
  ok: boolean
  result?: T
  error_code?: number
  description?: string
  parameters?: { retry_after?: number }
}

/** A Bot API call; null when Telegram could not be reached. */
async function telegram<T>(
  token: string,
  method: string,
  init: RequestInit,
): Promise<{ status: number; body: TelegramReply<T> } | null> {
  // The token is only ever sent to api.telegram.org.
  if (!/^\d+:[\w-]+$/.test(token)) return { status: 401, body: { ok: false } }
  const res = await send(`${TELEGRAM_API}/bot${token}/${method}`, init)
  if (!res) return null
  const body = (await res.json().catch(() => ({ ok: false }))) as TelegramReply<T>
  return { status: res.status, body }
}

export type TelegramCheck =
  | { ok: true; chat_id: string; title: string; username: string | null; bot: string }
  | { ok: false; invalid: boolean; reason?: 'not_admin' }

/**
 * Checks the bot (getMe), the channel (getChat) and that the bot may post there
 * (getChatMember: an administrator with can_post_messages).
 */
export async function checkTelegram(token: string, chat: string): Promise<TelegramCheck> {
  const me = await telegram<{ id: number; username?: string }>(token, 'getMe', json({}))
  if (!me) return { ok: false, invalid: false }
  if (me.status === 401 || me.status === 404) return { ok: false, invalid: true }
  if (!me.body.ok || !me.body.result) return { ok: false, invalid: false }
  const bot = me.body.result

  const found = await telegram<{ id: number; title?: string; username?: string; type: string }>(
    token,
    'getChat',
    json({ chat_id: chat }),
  )
  if (!found) return { ok: false, invalid: false }
  // Unknown channel, or one the bot is not in.
  if (!found.body.ok || !found.body.result) return { ok: false, invalid: true, reason: 'not_admin' }
  const channel = found.body.result

  const member = await telegram<{ status: string; can_post_messages?: boolean }>(
    token,
    'getChatMember',
    json({ chat_id: channel.id, user_id: bot.id }),
  )
  if (!member) return { ok: false, invalid: false }
  const status = member.body.result?.status
  const canPost =
    status === 'creator' ||
    (status === 'administrator' &&
      (channel.type !== 'channel' || member.body.result?.can_post_messages === true))
  if (!canPost) return { ok: false, invalid: true, reason: 'not_admin' }
  return {
    ok: true,
    chat_id: String(channel.id),
    title: channel.title ?? chat,
    username: channel.username ?? null,
    bot: bot.username ?? '',
  }
}

/** Telegram's limit for the caption of a photo (the post goes as a message above it). */
const TELEGRAM_CAPTION_MAX = 1024

/** Link to a message: public channels by name, private ones by id (t.me/c/…). */
function telegramMessageUrl(channel: TelegramChannel, messageId: number): string | null {
  if (channel.username) return `https://t.me/${channel.username}/${messageId}`
  const id = channel.chat_id.replace(/^-100/, '')
  return id !== channel.chat_id ? `https://t.me/c/${id}/${messageId}` : null
}

/**
 * Posts in the channel: the text as a message (with the link's preview), the images as a
 * photo or an album. A short post goes as the caption of the photos; a longer one is sent
 * first, the photos after it. Telegram has no text alternative for images.
 */
export async function publishToTelegram(
  channel: TelegramChannel,
  request: PublishRequest,
): Promise<PublishResult> {
  const images = (request.images ?? []).slice(0, 10)
  const fail = (reply: { status: number; body: TelegramReply<unknown> } | null) => {
    if (!reply) return failure(errorCode('provider_error', 'telegram'), true)
    // Token revoked, bot removed from the channel or no longer allowed to post.
    if (reply.status === 401 || reply.status === 403)
      return failure(errorCode('invalid_credential', 'telegram'), false, true)
    if (reply.status === 429) return failure(errorCode('rate_limited', 'telegram'), true)
    if (reply.status === 400) return failure(errorCode('post_rejected', 'telegram'), false)
    return failure(errorCode('provider_error', 'telegram'), true)
  }
  const captioned = images.length > 0 && request.content.length <= TELEGRAM_CAPTION_MAX

  let first: number | undefined
  if (!captioned) {
    const sent = await telegram<{ message_id: number }>(
      channel.token,
      'sendMessage',
      json({ chat_id: channel.chat_id, text: request.content }),
    )
    if (!sent?.body.ok || !sent.body.result) return fail(sent)
    first = sent.body.result.message_id
  }

  if (images.length) {
    const form = new FormData()
    form.append('chat_id', channel.chat_id)
    const extension = (mime: string) => mime.split('/')[1] ?? 'jpg'
    const caption = captioned ? { caption: request.content } : {}
    for (const [index, image] of images.entries())
      form.append(
        `photo${index}`,
        new Blob([await image.load()], { type: image.mime }),
        `image-${index + 1}.${extension(image.mime)}`,
      )
    let reply
    if (images.length === 1) {
      form.append('photo', form.get('photo0')!)
      form.delete('photo0')
      if (captioned) form.append('caption', request.content)
      reply = await telegram<{ message_id: number }>(channel.token, 'sendPhoto', {
        method: 'POST',
        body: form,
      })
    } else {
      form.append(
        'media',
        JSON.stringify(
          images.map((_, index) => ({
            type: 'photo',
            media: `attach://photo${index}`,
            ...(index === 0 ? caption : {}),
          })),
        ),
      )
      reply = await telegram<{ message_id: number }[]>(channel.token, 'sendMediaGroup', {
        method: 'POST',
        body: form,
      })
    }
    // The text went out already: the post counts as sent, without its images.
    if (!reply?.body.ok || !reply.body.result) {
      if (first === undefined) return fail(reply)
    } else if (first === undefined) {
      const result = reply.body.result
      first = Array.isArray(result) ? result[0]?.message_id : result.message_id
    }
  }

  return {
    ok: true,
    external_id: first !== undefined ? String(first) : null,
    url: first !== undefined ? telegramMessageUrl(channel, first) : null,
  }
}
