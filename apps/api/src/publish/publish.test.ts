import { parseTopicConfig } from '@glimr/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  blueskyHandle,
  checkTelegram,
  discordWebhookUrl,
  publishToBluesky,
  publishToDiscord,
  publishToTelegram,
  telegramChat,
} from './direct'
import {
  publishToMastodon,
  publishWithZernio,
  type PublishRequest,
  type PublishResult,
} from './networks'
import {
  pickAccount,
  publish,
  type DuePost,
  type Networks,
  type PublishCredentials,
  type PublishStore,
} from './publish'

const config = parseTopicConfig({
  channels: [
    { channel: 'linkedin', account_id: 'li-1', langs: ['fr', 'en'] },
    { channel: 'mastodon', account_id: 'me@mastodon.social', langs: ['fr'] },
  ],
})

function post(overrides: Partial<DuePost> = {}): DuePost {
  return {
    id: 'p1',
    item_id: 'i1',
    composition_id: null,
    topic_id: 't1',
    workspace_id: 'w1',
    channel: 'linkedin',
    lang: 'fr',
    body: 'Un texte.',
    first_comment: null,
    publish_attempts: 0,
    link: 'https://example.org/a',
    images: [],
    topic_config: config,
    ...overrides,
  }
}

function fakeStore(posts: DuePost[], keys = { zernio: 'sk_x', mastodon: true }) {
  const log: string[] = []
  const store: PublishStore = {
    claimDue: async () => posts,
    credentials: async (): Promise<PublishCredentials> => ({
      zernio: keys.zernio || undefined,
      mastodon: keys.mastodon
        ? { 'me@mastodon.social': { instance: 'https://mastodon.social', token: 't' } }
        : {},
      bluesky: {},
      discord: {},
      telegram: {},
    }),
    markSent: async (p, r) => void log.push(`sent ${p.id} ${r.url}`),
    markFailed: async (p, error, final, retryAt) =>
      void log.push(
        `failed ${p.id} ${error} ${final ? 'final' : `retry ${retryAt?.toISOString()}`}`,
      ),
    release: async (p) => void log.push(`release ${p.id}`),
    markCredentialInvalid: async (w, provider) => void log.push(`invalid ${w} ${provider}`),
    finishItem: async (t, i) => void log.push(`finish ${t}/${i}`),
    finishComposition: async (id) => void log.push(`finish composition ${id}`),
    imageBytes: async () => new Uint8Array([1, 2, 3]),
  }
  return { store, log }
}

const ok: PublishResult = { ok: true, external_id: 'x', url: 'https://example.social/1' }

describe('publish', () => {
  const now = () => new Date('2026-10-02T07:00:00Z')

  it('sends each post to the account of its channel and language, with the link', async () => {
    const calls: unknown[] = []
    const networks: Networks = {
      zernio: async (key, account, request) => (calls.push([key, account, request]), ok),
      mastodon: async (account, request) => (calls.push([account.instance, request]), ok),
      bluesky: async () => ok,
      discord: async () => ok,
      telegram: async () => ok,
    }
    const { store, log } = fakeStore([post(), post({ id: 'p2', channel: 'mastodon' })])
    expect(await publish({ store, networks, now })).toEqual({ sent: 2, failed: 0, retried: 0 })
    expect(calls[0]).toEqual([
      'sk_x',
      'li-1',
      {
        channel: 'linkedin',
        lang: 'fr',
        content: 'Un texte.\n\nhttps://example.org/a',
        idempotencyKey: 'glimr-p1-0',
        firstComment: null,
      },
    ])
    expect(log).toContain('finish t1/i1')
  })

  it('adds the LinkedIn signature and the first comment, the post overriding the topic', async () => {
    const linkedin = parseTopicConfig({
      ...config,
      linkedin: {
        signature: { fr: 'Je suis Geoffrey.' },
        first_comment: { fr: 'À lire : https://example.org' },
      },
    })
    const requests: PublishRequest[] = []
    const networks: Networks = {
      zernio: async (_key, _account, request) => (requests.push(request), ok),
      mastodon: async (_account, request) => (requests.push(request), ok),
      bluesky: async () => ok,
      discord: async () => ok,
      telegram: async () => ok,
    }
    const { store } = fakeStore([
      post({ topic_config: linkedin }),
      post({ id: 'p2', topic_config: linkedin, first_comment: '' }),
      post({ id: 'p3', topic_config: linkedin, first_comment: 'Autre lien' }),
      post({ id: 'p4', topic_config: linkedin, channel: 'mastodon' }),
    ])
    await publish({ store, networks, now })
    expect(requests[0]).toMatchObject({
      content: 'Un texte.\n\nhttps://example.org/a\n\nJe suis Geoffrey.',
      firstComment: 'À lire : https://example.org',
    })
    expect(requests[1]!.firstComment).toBeNull()
    expect(requests[2]!.firstComment).toBe('Autre lien')
    expect(requests[3]).toMatchObject({
      content: 'Un texte.\n\nhttps://example.org/a',
      firstComment: null,
    })
  })

  it('fails a post whose channel and language have no account', async () => {
    const networks: Networks = {
      zernio: async () => ok,
      mastodon: async () => ok,
      bluesky: async () => ok,
      discord: async () => ok,
      telegram: async () => ok,
    }
    const { store, log } = fakeStore([post({ channel: 'mastodon', lang: 'en' })])
    await publish({ store, networks, now })
    expect(log[0]).toBe('failed p1 channel_not_configured:mastodon/en final')
  })

  it('fails without a Zernio key', async () => {
    const networks: Networks = {
      zernio: async () => ok,
      mastodon: async () => ok,
      bluesky: async () => ok,
      discord: async () => ok,
      telegram: async () => ok,
    }
    const { store, log } = fakeStore([post()], { zernio: '', mastodon: true })
    await publish({ store, networks, now })
    expect(log[0]).toBe('failed p1 missing_credential:zernio final')
  })

  it('retries a transient error later, then gives up', async () => {
    const networks: Networks = {
      zernio: async () => ({ ok: false, error: 'provider_error:zernio', retry: true }),
      mastodon: async () => ok,
      bluesky: async () => ok,
      discord: async () => ok,
      telegram: async () => ok,
    }
    const first = fakeStore([post()])
    await publish({ store: first.store, networks, now })
    expect(first.log[0]).toBe('failed p1 provider_error:zernio retry 2026-10-02T07:15:00.000Z')

    const last = fakeStore([post({ publish_attempts: 2 })])
    await publish({ store: last.store, networks, now })
    expect(last.log[0]).toBe('failed p1 provider_error:zernio final')
  })

  it('stops using a rejected key and leaves the other posts for later', async () => {
    const networks: Networks = {
      zernio: async () => ({
        ok: false,
        error: 'invalid_credential:zernio',
        retry: false,
        invalidCredential: true,
      }),
      mastodon: async () => ok,
      bluesky: async () => ok,
      discord: async () => ok,
      telegram: async () => ok,
    }
    const { store, log } = fakeStore([post(), post({ id: 'p2', lang: 'en' })])
    await publish({ store, networks, now })
    expect(log.slice(0, 3)).toEqual([
      'invalid w1 zernio',
      'failed p1 invalid_credential:zernio final',
      'release p2',
    ])
  })
})

describe('pickAccount', () => {
  const accounts = { 'a.bsky.social': 'A', 'b.bsky.social': 'B' }

  it('takes the account the topic chose', () => {
    expect(pickAccount(accounts, 'b.bsky.social')).toBe('B')
  })

  it('falls back on the only account, and refuses to guess between several', () => {
    expect(pickAccount({ only: 'O' }, 'an-older-id')).toBe('O')
    expect(pickAccount(accounts, 'c.bsky.social')).toBeUndefined()
  })
})

describe('networks', () => {
  afterEach(() => vi.unstubAllGlobals())

  function respond(status: number, body: unknown) {
    const requests: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      requests.push({ url, init })
      return new Response(JSON.stringify(body), { status })
    })
    return requests
  }

  const request = {
    channel: 'linkedin' as const,
    lang: 'en' as const,
    content: 'Hi\n\nhttps://example.org',
    idempotencyKey: 'glimr-p1-0',
  }

  it('publishes now with Zernio and reads the link of the post', async () => {
    const requests = respond(201, {
      post: {
        _id: 'z1',
        status: 'published',
        platforms: [
          { platform: 'linkedin', status: 'published', platformPostUrl: 'https://linkedin.com/x' },
        ],
      },
    })
    expect(await publishWithZernio('sk_x', 'acc', request)).toEqual({
      ok: true,
      external_id: 'z1',
      url: 'https://linkedin.com/x',
    })
    expect(requests[0]!.url).toBe('https://zernio.com/api/v1/posts')
    expect(new Headers(requests[0]!.init.headers).get('Idempotency-Key')).toBe('glimr-p1-0')
    expect(JSON.parse(requests[0]!.init.body as string)).toEqual({
      content: request.content,
      platforms: [{ platform: 'linkedin', accountId: 'acc' }],
      publishNow: true,
    })
  })

  it('sends the first comment on the LinkedIn entry', async () => {
    const requests = respond(201, {
      post: {
        _id: 'z1',
        status: 'published',
        platforms: [{ platform: 'linkedin', status: 'published' }],
      },
    })
    await publishWithZernio('sk_x', 'acc', { ...request, firstComment: 'À lire' })
    expect(JSON.parse(requests[0]!.init.body as string).platforms).toEqual([
      { platform: 'linkedin', accountId: 'acc', platformSpecificData: { firstComment: 'À lire' } },
    ])
  })

  it('reads a failure on the platform entry of a 207 answer', async () => {
    respond(207, {
      post: {
        _id: 'z1',
        status: 'failed',
        platforms: [{ platform: 'linkedin', status: 'failed', errorCategory: 'auth_expired' }],
      },
    })
    expect(await publishWithZernio('sk_x', 'acc', request)).toMatchObject({
      ok: false,
      error: 'account_disconnected:linkedin',
      retry: false,
    })
  })

  it('leaves Bluesky and Discord out of Zernio', async () => {
    const requests = respond(201, {})
    expect(
      await publishWithZernio('sk_x', 'acc', { ...request, channel: 'bluesky' }),
    ).toMatchObject({ ok: false, retry: false })
    expect(requests).toHaveLength(0)
  })

  it('posts to Bluesky with the app password, the language and a link facet', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) })
      if (url.endsWith('createSession')) return Response.json({ accessJwt: 'jwt' })
      return Response.json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz', cid: 'c' })
    })
    const content = 'Été accessible\n\nhttps://example.org/a'
    const result = await publishToBluesky(
      {
        did: 'did:plc:abc',
        pds: 'https://pds.example',
        password: 'app-pass',
        handle: 'me.bsky.social',
      },
      {
        channel: 'bluesky',
        lang: 'fr',
        content,
        idempotencyKey: 'k',
        url: 'https://example.org/a',
      },
    )
    expect(result).toEqual({
      ok: true,
      external_id: 'at://did:plc:abc/app.bsky.feed.post/3kxyz',
      url: 'https://bsky.app/profile/me.bsky.social/post/3kxyz',
    })
    expect(calls[0]).toMatchObject({
      url: 'https://pds.example/xrpc/com.atproto.server.createSession',
      body: { identifier: 'did:plc:abc', password: 'app-pass' },
    })
    const record = calls[1]!.body.record as {
      langs: string[]
      facets: { index: { byteStart: number; byteEnd: number }; features: { uri: string }[] }[]
    }
    expect(record.langs).toEqual(['fr'])
    // "Été accessible" is 14 characters but 16 bytes: facets count bytes.
    expect(record.facets[0]!.index).toEqual({ byteStart: 18, byteEnd: 18 + 21 })
    expect(record.facets[0]!.features[0]!.uri).toBe('https://example.org/a')
  })

  it('reports a refused Bluesky app password as a bad key', async () => {
    respond(401, { error: 'AuthenticationRequired' })
    expect(
      await publishToBluesky(
        { did: 'did:plc:abc', pds: 'https://pds.example', password: 'x', handle: 'me.bsky.social' },
        { ...request, channel: 'bluesky', url: 'https://example.org' },
      ),
    ).toMatchObject({ ok: false, error: 'invalid_credential:bluesky', invalidCredential: true })
  })

  it('posts to the Telegram channel as a message, with a link to it', async () => {
    const requests = respond(200, { ok: true, result: { message_id: 42 } })
    const result = await publishToTelegram(
      { token: '123:abc', chat_id: '-1001234567', username: 'veille_a11y' },
      { ...request, channel: 'telegram' },
    )
    expect(result).toEqual({
      ok: true,
      external_id: '42',
      url: 'https://t.me/veille_a11y/42',
    })
    expect(requests[0]!.url).toBe('https://api.telegram.org/bot123:abc/sendMessage')
    expect(JSON.parse(requests[0]!.init.body as string)).toEqual({
      chat_id: '-1001234567',
      text: request.content,
    })
  })

  it('links to a message of a private Telegram channel by its id', async () => {
    respond(200, { ok: true, result: { message_id: 7 } })
    const result = await publishToTelegram(
      { token: '123:abc', chat_id: '-1001234567' },
      { ...request, channel: 'telegram' },
    )
    expect(result).toMatchObject({ ok: true, url: 'https://t.me/c/1234567/7' })
  })

  it('puts a short post under its photo, as its caption', async () => {
    const requests = respond(200, { ok: true, result: { message_id: 9 } })
    const result = await publishToTelegram(
      { token: '123:abc', chat_id: '-1001234567' },
      {
        ...request,
        channel: 'telegram',
        images: [
          {
            url: 'https://img.example/1.png',
            mime: 'image/png',
            width: 10,
            height: 10,
            alt: 'Un graphique',
            load: async () => new Uint8Array([1, 2, 3]),
          },
        ],
      },
    )
    expect(result).toMatchObject({ ok: true, external_id: '9' })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url).toBe('https://api.telegram.org/bot123:abc/sendPhoto')
    const form = requests[0]!.init.body as FormData
    expect(form.get('caption')).toBe(request.content)
    expect(form.get('photo')).toBeInstanceOf(Blob)
  })

  it('reports a bot removed from the channel as a bad key', async () => {
    respond(403, { ok: false, error_code: 403, description: 'Forbidden: bot is not a member' })
    expect(
      await publishToTelegram(
        { token: '123:abc', chat_id: '-1001234567' },
        { ...request, channel: 'telegram' },
      ),
    ).toMatchObject({ ok: false, error: 'invalid_credential:telegram', invalidCredential: true })
  })

  it('never sends a malformed Telegram token anywhere', async () => {
    const requests = respond(200, { ok: true, result: { message_id: 1 } })
    const result = await publishToTelegram(
      { token: 'evil.example/x', chat_id: '-1001234567' },
      { ...request, channel: 'telegram' },
    )
    expect(result).toMatchObject({ ok: false, invalidCredential: true })
    expect(requests).toHaveLength(0)
  })

  it('reads a Telegram channel as typed', () => {
    expect(telegramChat('@veille_a11y')).toBe('@veille_a11y')
    expect(telegramChat('https://t.me/veille_a11y')).toBe('@veille_a11y')
    expect(telegramChat('veille_a11y')).toBe('@veille_a11y')
    expect(telegramChat('-1001234567')).toBe('-1001234567')
    expect(telegramChat('https://evil.example/x')).toBeNull()
    expect(telegramChat('a b')).toBeNull()
  })

  it('accepts a Telegram bot only when it may post in the channel', async () => {
    const replies: Record<string, unknown> = {
      getMe: { ok: true, result: { id: 5, username: 'glimr_bot' } },
      getChat: {
        ok: true,
        result: { id: -1001234567, type: 'channel', title: 'Veille', username: 'veille_a11y' },
      },
      getChatMember: { ok: true, result: { status: 'administrator', can_post_messages: true } },
    }
    vi.stubGlobal('fetch', async (url: string) => {
      const method = url.split('/').pop()!
      return new Response(JSON.stringify(replies[method]), { status: 200 })
    })
    expect(await checkTelegram('123:abc', '@veille_a11y')).toEqual({
      ok: true,
      chat_id: '-1001234567',
      title: 'Veille',
      username: 'veille_a11y',
      bot: 'glimr_bot',
    })
    replies.getChatMember = { ok: true, result: { status: 'member' } }
    expect(await checkTelegram('123:abc', '@veille_a11y')).toEqual({
      ok: false,
      invalid: true,
      reason: 'not_admin',
    })
  })

  it('posts to the Discord webhook without pinging anyone', async () => {
    const requests = respond(200, { id: 'm1', channel_id: 'c1' })
    const result = await publishToDiscord(
      { url: 'https://discord.com/api/webhooks/1/tok', guild_id: 'g1' },
      { ...request, channel: 'discord' },
    )
    expect(result).toEqual({
      ok: true,
      external_id: 'm1',
      url: 'https://discord.com/channels/g1/c1/m1',
    })
    expect(requests[0]!.url).toBe('https://discord.com/api/webhooks/1/tok?wait=true')
    expect(JSON.parse(requests[0]!.init.body as string)).toEqual({
      content: request.content,
      allowed_mentions: { parse: [] },
    })
  })

  it('accepts only Discord webhook addresses and Bluesky handles', () => {
    expect(discordWebhookUrl('https://discordapp.com/api/webhooks/123/ab-C_d')).toBe(
      'https://discord.com/api/webhooks/123/ab-C_d',
    )
    expect(discordWebhookUrl('https://evil.example/api/webhooks/123/abc')).toBeNull()
    expect(blueskyHandle('@Geoffrey.bsky.social')).toBe('geoffrey.bsky.social')
    expect(blueskyHandle('https://bsky.app/profile/geoffrey.bsky.social')).toBe(
      'geoffrey.bsky.social',
    )
    expect(blueskyHandle('not a handle')).toBeNull()
  })

  it('treats a duplicate (409) as already published', async () => {
    respond(409, { error: 'duplicate', details: { existingPostId: 'z0' } })
    expect(await publishWithZernio('sk_x', 'acc', request)).toEqual({
      ok: true,
      external_id: 'z0',
      url: null,
    })
  })

  it('posts to Mastodon with the language of the post', async () => {
    const requests = respond(200, { id: '42', url: 'https://mastodon.social/@me/42' })
    const result = await publishToMastodon(
      { instance: 'https://mastodon.social', token: 't' },
      { ...request, channel: 'mastodon' },
    )
    expect(result).toEqual({ ok: true, external_id: '42', url: 'https://mastodon.social/@me/42' })
    expect(requests[0]!.url).toBe('https://mastodon.social/api/v1/statuses')
    expect(JSON.parse(requests[0]!.init.body as string)).toEqual({
      status: request.content,
      language: 'en',
      visibility: 'public',
    })
  })

  it('reports a rejected Mastodon token', async () => {
    respond(401, { error: 'The access token is invalid' })
    expect(
      await publishToMastodon(
        { instance: 'https://mastodon.social', token: 't' },
        { ...request, channel: 'mastodon' },
      ),
    ).toMatchObject({ ok: false, error: 'invalid_credential:mastodon', invalidCredential: true })
  })
})

describe('images of composed posts', () => {
  afterEach(() => vi.unstubAllGlobals())

  const image = {
    url: 'https://storage.example/signed/a.jpg',
    mime: 'image/jpeg',
    width: 1200,
    height: 800,
    alt: 'Capture de la nouvelle version',
    load: async () => new Uint8Array([1, 2, 3]),
  }
  const request = {
    channel: 'linkedin' as const,
    lang: 'fr' as const,
    content: 'Notre version 2 est là.',
    idempotencyKey: 'glimr-p1-0',
    images: [image],
  }

  it('sends a composed post without a link, with its images in the language of the post', async () => {
    const calls: PublishRequest[] = []
    const networks: Networks = {
      zernio: async (_k, _a, r) => (calls.push(r), ok),
      mastodon: async () => ok,
      bluesky: async () => ok,
      discord: async () => ok,
      telegram: async () => ok,
    }
    const { store, log } = fakeStore([
      post({
        item_id: null,
        composition_id: 'c1',
        link: '',
        images: [
          {
            path: 't1/c1/a.jpg',
            url: image.url,
            mime: 'image/jpeg',
            width: 1200,
            height: 800,
            alt: { fr: 'Capture', en: 'Screenshot' },
          },
        ],
      }),
    ])
    expect(await publish({ store, networks })).toEqual({ sent: 1, failed: 0, retried: 0 })
    expect(calls[0]!.content).toBe('Un texte.')
    expect(calls[0]!.images![0]).toMatchObject({ url: image.url, alt: 'Capture' })
    expect(await calls[0]!.images![0]!.load()).toEqual(new Uint8Array([1, 2, 3]))
    expect(log).toContain('finish composition c1')
    expect(log.some((l) => l.startsWith('finish t1/'))).toBe(false)
  })

  it('gives Zernio the images by address, with their text alternative', async () => {
    const requests: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      requests.push({ url, init })
      return Response.json({ post: { _id: 'z1', platforms: [{ platform: 'linkedin' }] } })
    })
    await publishWithZernio('sk_x', 'acc', request)
    expect(JSON.parse(requests[0]!.init.body as string).mediaItems).toEqual([
      { type: 'image', url: image.url, altText: 'Capture de la nouvelle version' },
    ])
  })

  it('uploads to Bluesky and embeds the images with their text and size', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith('createSession')) return Response.json({ accessJwt: 'jwt' })
      if (url.endsWith('uploadBlob')) return Response.json({ blob: { ref: 'b1' } })
      return Response.json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3k', cid: 'c' })
    })
    const result = await publishToBluesky(
      { did: 'did:plc:abc', pds: 'https://pds.example', password: 'p', handle: 'me.bsky.social' },
      { ...request, channel: 'bluesky', url: '' },
    )
    expect(result.ok).toBe(true)
    expect(calls[1]!.url).toBe('https://pds.example/xrpc/com.atproto.repo.uploadBlob')
    expect((calls[1]!.init.headers as Record<string, string>)['Content-Type']).toBe('image/jpeg')
    const record = JSON.parse(calls[2]!.init.body as string).record
    expect(record.facets).toBeUndefined()
    expect(record.embed).toEqual({
      $type: 'app.bsky.embed.images',
      images: [
        {
          image: { ref: 'b1' },
          alt: 'Capture de la nouvelle version',
          aspectRatio: { width: 1200, height: 800 },
        },
      ],
    })
  })

  it('uploads to Mastodon with the description, then attaches the media', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith('/api/v2/media')) return Response.json({ id: 'm9' })
      return Response.json({ id: '42', url: 'https://mastodon.social/@me/42' })
    })
    const result = await publishToMastodon(
      { instance: 'https://mastodon.social', token: 't' },
      { ...request, channel: 'mastodon' },
    )
    expect(result.ok).toBe(true)
    const form = calls[0]!.init.body as FormData
    expect(form.get('description')).toBe('Capture de la nouvelle version')
    expect(JSON.parse(calls[1]!.init.body as string).media_ids).toEqual(['m9'])
  })

  it('posts the images to Discord with their description', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return Response.json({ id: 'm1', channel_id: 'c1' })
    })
    await publishToDiscord(
      { url: 'https://discord.com/api/webhooks/1/tok', guild_id: 'g1' },
      { ...request, channel: 'discord' },
    )
    const form = calls[0]!.init.body as FormData
    expect(JSON.parse(form.get('payload_json') as string).attachments).toEqual([
      { id: 0, description: 'Capture de la nouvelle version', filename: 'image-1.jpeg' },
    ])
    expect(form.get('files[0]')).toBeInstanceOf(Blob)
  })
})

describe('Zernio in platform mode', () => {
  it('publishes only to the accounts of the workspace’s own profile', async () => {
    const sent: string[] = []
    const networks: Networks = {
      zernio: async (_key, account) => (sent.push(account), ok),
      mastodon: async () => ok,
      bluesky: async () => ok,
      discord: async () => ok,
      telegram: async () => ok,
    }
    const { store, log } = fakeStore([post(), post({ id: 'p2', lang: 'en' })])
    const credentials = store.credentials
    store.credentials = async (w) => ({
      ...(await credentials(w)),
      zernio: 'glimr_key',
      zernioAccounts: ['someone-else'],
    })
    expect(await publish({ store, networks })).toEqual({ sent: 0, failed: 2, retried: 0 })
    expect(sent).toEqual([])
    expect(log[0]).toContain('channel_not_configured:linkedin/fr final')

    store.credentials = async (w) => ({
      ...(await credentials(w)),
      zernio: 'glimr_key',
      zernioAccounts: ['li-1'],
    })
    expect((await publish({ store, networks })).sent).toBe(2)
    expect(sent).toEqual(['li-1', 'li-1'])
  })
})
