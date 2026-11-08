import { describe, expect, it } from 'vitest'
import { handleMcp, serveMcp, type ApiCall } from './server'

const env = {
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
} as never
const TOPIC = '9d45500e-e01c-4538-b78f-447f49fb6c0c'
const ITEM = 'ecf2add0-e6e4-4884-b45f-d9993420b602'

function rpc(method: string, params: unknown = {}, id = 1) {
  return new Request('https://pann.example/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'Mcp-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
}

function fakeApi(answers: Record<string, unknown> = {}) {
  const calls: [string, string, unknown][] = []
  const api: ApiCall = async (method, path, body) => {
    calls.push([method, path, body])
    const key = `${method} ${path.split('?')[0]}`
    if (key in answers) return { ok: true, status: 200, data: answers[key] }
    return { ok: false, status: 409, data: { error: 'Cannot go from published to rejected' } }
  }
  return { api, calls }
}

async function result(res: Response) {
  const body = (await res.json()) as { result?: Record<string, unknown>; error?: unknown }
  return body.result as {
    tools?: { name: string; annotations?: Record<string, boolean> }[]
    content?: { text: string }[]
    isError?: boolean
    instructions?: string
  }
}

describe('MCP endpoint', () => {
  it('asks for a token and points to the protected resource metadata', async () => {
    const res = await handleMcp(rpc('tools/list'), env, () => fakeApi().api)
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe(
      'Bearer resource_metadata="https://pann.example/.well-known/oauth-protected-resource/mcp"',
    )
  })

  it('names Supabase Auth as the authorization server', async () => {
    const res = await handleMcp(
      new Request('https://pann.example/.well-known/oauth-protected-resource/mcp'),
      env,
      () => fakeApi().api,
    )
    expect(await res.json()).toEqual({
      resource: 'https://pann.example/mcp',
      authorization_servers: ['https://ref.supabase.co/auth/v1'],
      bearer_methods_supported: ['header'],
      resource_name: 'Pann',
    })
  })
})

describe('Pann MCP server', () => {
  it('initializes with instructions and lists its tools', async () => {
    const init = await result(
      await serveMcp(
        rpc('initialize', {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        }),
        fakeApi().api,
      ),
    )
    expect(init.instructions).toContain('always ask the user before using "now"')

    const list = await result(await serveMcp(rpc('tools/list'), fakeApi().api))
    expect(list.tools?.map((t) => t.name)).toEqual([
      'list_topics',
      'get_topic_kinds',
      'list_items',
      'get_item',
      'set_item_status',
      'add_link',
      'update_summary',
      'update_post',
      'redraft_item',
      'schedule_item',
      'unschedule_item',
      'get_queue',
      'get_newsletter',
    ])
    expect(list.tools?.find((t) => t.name === 'list_items')?.annotations?.readOnlyHint).toBe(true)
  })

  it('lists items through the API, filtered and trimmed', async () => {
    const row = (id: string, kind: string) => ({
      item_id: id,
      status: 'new',
      relevance_score: 80,
      is_commercial: false,
      triage_reason: 'Utile',
      draft_status: 'none',
      publish_at: null,
      kind,
      item: { title: `T${id}`, canonical_url: `https://e.org/${id}`, discovered_at: 'd' },
    })
    const { api, calls } = fakeApi({
      [`GET /topics/${TOPIC}/items`]: [row('a', 'legal'), row('b', 'tool'), row('c', 'legal')],
    })
    const res = await result(
      await serveMcp(
        rpc('tools/call', {
          name: 'list_items',
          arguments: { topic_id: TOPIC, kind: 'legal', limit: 1 },
        }),
        api,
      ),
    )
    expect(calls[0]).toEqual(['GET', `/topics/${TOPIC}/items?status=new&limit=100`, undefined])
    expect(JSON.parse(res.content![0]!.text)).toEqual([
      {
        item_id: 'a',
        title: 'Ta',
        url: 'https://e.org/a',
        kind: 'legal',
        score: 80,
        reason: 'Utile',
        commercial: false,
        discovered_at: 'd',
        draft_status: 'none',
        publish_at: null,
      },
    ])
  })

  it('sorts an item with the API route and reports its error codes', async () => {
    const { api, calls } = fakeApi()
    const res = await result(
      await serveMcp(
        rpc('tools/call', {
          name: 'set_item_status',
          arguments: { topic_id: TOPIC, item_id: ITEM, status: 'rejected' },
        }),
        api,
      ),
    )
    expect(calls[0]).toEqual(['PATCH', `/topics/${TOPIC}/items/${ITEM}`, { status: 'rejected' }])
    expect(res.isError).toBe(true)
    expect(res.content![0]!.text).toBe('Error: Cannot go from published to rejected')
  })

  it('refuses arguments that do not match the schema', async () => {
    const { api, calls } = fakeApi()
    const res = await result(
      await serveMcp(
        rpc('tools/call', {
          name: 'schedule_item',
          arguments: { topic_id: TOPIC, item_id: ITEM, when: 'tomorrow' },
        }),
        api,
      ),
    )
    expect(res.isError).toBe(true)
    expect(calls).toEqual([])
  })
})
