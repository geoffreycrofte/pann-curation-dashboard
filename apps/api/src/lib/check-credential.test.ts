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
