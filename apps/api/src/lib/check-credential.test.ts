import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkCredential } from './check-credential'

const calls: string[] = []
function respond(status: number, body: unknown = {}) {
  vi.stubGlobal('fetch', async (input: URL | string | Request) => {
    calls.push(input instanceof Request ? input.url : input.toString())
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  calls.length = 0
})

describe('checkCredential', () => {
  it('validates an Anthropic key with the free models list', async () => {
    respond(200, { data: [], has_more: false, first_id: null, last_id: null })
    expect(await checkCredential('anthropic', 'sk-ant-xxxx')).toEqual({
      status: 'ok',
      detail: null,
    })
    expect(calls[0]).toContain('/v1/models')
  })

  it('reports a rejected Anthropic key as invalid', async () => {
    respond(401, {
      type: 'error',
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    })
    expect(await checkCredential('anthropic', 'sk-ant-bad')).toEqual({
      status: 'invalid',
      detail: 'invalid_key',
    })
  })

  it('validates a GitHub token with the rate limit endpoint', async () => {
    respond(200, { resources: {} })
    expect(await checkCredential('github', 'github_pat_x')).toEqual({ status: 'ok', detail: null })
    respond(401)
    expect(await checkCredential('github', 'github_pat_bad')).toEqual({
      status: 'invalid',
      detail: 'invalid_key',
    })
  })

  it('keeps the key when the provider is unreachable, and does not spend money on Exa', async () => {
    respond(503)
    expect(await checkCredential('github', 'github_pat_x')).toEqual({
      status: 'unchecked',
      detail: 'provider_unreachable',
    })
    expect(await checkCredential('exa', 'exa-key')).toEqual({
      status: 'unchecked',
      detail: 'no_free_check',
    })
  })
})

describe('mastodonInstance', () => {
  it('accepts a host or a URL, and keeps only the origin', async () => {
    const { mastodonInstance } = await import('./check-credential')
    expect(mastodonInstance('mastodon.social')).toBe('https://mastodon.social')
    expect(mastodonInstance('https://piaille.fr/@me')).toBe('https://piaille.fr')
    expect(mastodonInstance('http://mastodon.social')).toBeNull()
    expect(mastodonInstance('localhost')).toBeNull()
    expect(mastodonInstance('192.168.1.10')).toBeNull()
  })
})

describe('social credentials', () => {
  it('lists the LinkedIn and Facebook accounts of a Zernio key', async () => {
    respond(200, {
      accounts: [
        { _id: 'a1', platform: 'linkedin', username: 'geoffrey', isActive: true },
        { _id: 'a2', platform: 'instagram', username: 'x' },
        { _id: 'a3', platform: 'twitter', username: 'gcrofte' },
        { _id: 'a4', platform: 'facebook', username: 'Pann' },
        // Published directly now: not taken from Zernio.
        { _id: 'a5', platform: 'bluesky', username: 'me.bsky.social' },
      ],
    })
    const check = await checkCredential('zernio', 'sk_xxxxxxxx')
    expect(check.status).toBe('ok')
    expect(check.meta?.accounts).toEqual([
      { id: 'a1', platform: 'linkedin', username: 'geoffrey', active: true },
      { id: 'a4', platform: 'facebook', username: 'Pann', active: true },
    ])
    expect(calls[0]).toBe('https://zernio.com/api/v1/accounts')
  })

  it('checks a Mastodon token and keeps the account handle', async () => {
    respond(200, { acct: 'geoffrey', configuration: { statuses: { max_characters: 1000 } } })
    const check = await checkCredential('mastodon', 'token-xxxx', {
      instance: 'https://piaille.fr',
    })
    expect(check).toEqual({
      status: 'ok',
      detail: null,
      meta: { instance: 'https://piaille.fr', acct: 'geoffrey@piaille.fr', max_characters: 1000 },
    })
    expect(calls).toEqual([
      'https://piaille.fr/api/v1/accounts/verify_credentials',
      'https://piaille.fr/api/v2/instance',
    ])
  })
})
