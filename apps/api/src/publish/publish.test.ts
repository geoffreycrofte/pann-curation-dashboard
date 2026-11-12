import { parseTopicConfig } from '@pann/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { blueskyHandle, discordWebhookUrl, publishToBluesky, publishToDiscord } from './direct'
import { publishToMastodon, publishWithZernio, type PublishResult } from './networks'
import { publish, type DuePost, type Networks, type PublishStore } from './publish'

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
    topic_id: 't1',
    workspace_id: 'w1',
    channel: 'linkedin',
    lang: 'fr',
    body: 'Un texte.',
    publish_attempts: 0,
    canonical_url: 'https://example.org/a',
    topic_config: config,
    ...overrides,
  }
}

function fakeStore(posts: DuePost[], keys = { zernio: 'sk_x', mastodon: true }) {
  const log: string[] = []
  const store: PublishStore = {
    claimDue: async () => posts,
    credentials: async () => ({
      zernio: keys.zernio || undefined,
      mastodon: keys.mastodon ? { instance: 'https://mastodon.social', token: 't' } : undefined,
    }),
    markSent: async (p, r) => void log.push(`sent ${p.id} ${r.url}`),
    markFailed: async (p, error, final, retryAt) =>
      void log.push(
        `failed ${p.id} ${error} ${final ? 'final' : `retry ${retryAt?.toISOString()}`}`,
      ),
    release: async (p) => void log.push(`release ${p.id}`),
    markCredentialInvalid: async (w, provider) => void log.push(`invalid ${w} ${provider}`),
    finishItem: async (t, i) => void log.push(`finish ${t}/${i}`),
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
        idempotencyKey: 'pann-p1-0',
      },
    ])
    expect(log).toContain('finish t1/i1')
  })

  it('fails a post whose channel and language have no account', async () => {
    const networks: Networks = {
      zernio: async () => ok,
      mastodon: async () => ok,
      bluesky: async () => ok,
      discord: async () => ok,
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
    idempotencyKey: 'pann-p1-0',
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
    expect(new Headers(requests[0]!.init.headers).get('Idempotency-Key')).toBe('pann-p1-0')
    expect(JSON.parse(requests[0]!.init.body as string)).toEqual({
      content: request.content,
      platforms: [{ platform: 'linkedin', accountId: 'acc' }],
      publishNow: true,
    })
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
