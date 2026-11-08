import { ITEM_TOPIC_STATUSES, KIND_KEY, LANGS } from '@pann/shared'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Env } from '../env'

/** Calls the board API as the user (same routes, same RLS, same checks). */
export type ApiCall = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
) => Promise<{ ok: boolean; status: number; data: unknown }>

const INSTRUCTIONS = `Pann is a content-curation tool. Each topic (board) collects items from its sources; an AI triage scores them (0 to 100) and the user sorts them.
Item statuses: new (to sort), validated (kept), rejected, archived (scored below the topic threshold), published (its posts went out).
Validating an item queues the AI drafting of its summaries (French and English) and of its social posts (one per network and language). Drafting takes a few seconds to a minute: read the item again to see the drafts.
Posts go out on the topic's slots once scheduled (schedule_item with when "next_slot"), or immediately with when "now". Publishing is public and cannot be undone from Pann: always ask the user before using "now".
Never invent an id: list topics, then items, to get them. Answers of the tools are JSON.`

const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }],
})

/** Error codes come from the API (see packages/shared/src/providers.ts). */
function failure(status: number, data: unknown) {
  const code = (data as { error?: string } | null)?.error ?? `http_${status}`
  return { isError: true, content: [{ type: 'text' as const, text: `Error: ${code}` }] }
}

async function run(call: ReturnType<ApiCall>, shape?: (data: unknown) => unknown) {
  const res = await call
  if (!res.ok) return failure(res.status, res.data)
  return json(shape ? shape(res.data) : (res.data ?? { ok: true }))
}

const topicId = z.string().uuid().describe('Topic id, from list_topics')
const itemId = z.string().uuid().describe('Item id, from list_items')

interface ItemRow {
  item_id: string
  status: string
  relevance_score: number | null
  is_commercial: boolean | null
  triage_reason: string | null
  draft_status: string
  publish_at: string | null
  kind: string | null
  item: { title: string; canonical_url: string; discovered_at: string }
}

/** One MCP server per request (stateless): nothing is shared between users. */
export function createPannServer(api: ApiCall): McpServer {
  const server = new McpServer(
    { name: 'pann', title: 'Pann', version: '0.1.0' },
    { instructions: INSTRUCTIONS, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  )
  const readOnly = { readOnlyHint: true, openWorldHint: false }

  server.registerTool(
    'list_topics',
    {
      title: 'List topics',
      description: 'Topics (boards) the user can access, with their ids and names.',
      annotations: readOnly,
    },
    () =>
      run(api('GET', '/topics'), (rows) =>
        (rows as { id: string; slug: string; name_fr: string; name_en: string }[]).map((t) => ({
          id: t.id,
          slug: t.slug,
          name_fr: t.name_fr,
          name_en: t.name_en,
        })),
      ),
  )

  server.registerTool(
    'get_topic_kinds',
    {
      title: 'List the kinds of content of a topic',
      description:
        'Kinds of content of a topic (key, names, definition): the values accepted for "kind".',
      inputSchema: { topic_id: topicId },
      annotations: readOnly,
    },
    ({ topic_id }) =>
      run(
        api('GET', `/topics/${topic_id}`),
        (topic) => (topic as { config: { kinds: unknown } }).config.kinds,
      ),
  )

  server.registerTool(
    'list_items',
    {
      title: 'List items',
      description:
        'Items of a topic with a given status, best relevance first. Use status "new" for the items still to sort.',
      inputSchema: {
        topic_id: topicId,
        status: z.enum(ITEM_TOPIC_STATUSES).default('new'),
        kind: z
          .string()
          .regex(KIND_KEY)
          .optional()
          .describe(
            'Keep only this kind of content (a kind key of the topic, see get_topic_kinds)',
          ),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: readOnly,
    },
    ({ topic_id, status, kind, limit }) =>
      run(api('GET', `/topics/${topic_id}/items?status=${status}&limit=100`), (rows) =>
        (rows as ItemRow[])
          .filter((r) => !kind || r.kind === kind)
          .slice(0, limit)
          .map((r) => ({
            item_id: r.item_id,
            title: r.item.title,
            url: r.item.canonical_url,
            kind: r.kind,
            score: r.relevance_score,
            reason: r.triage_reason,
            commercial: r.is_commercial,
            discovered_at: r.item.discovered_at,
            draft_status: r.draft_status,
            publish_at: r.publish_at,
          })),
      ),
  )

  server.registerTool(
    'get_item',
    {
      title: 'Get an item',
      description:
        'One item with its summaries (French, English) and its post drafts per network and language, with their publication status.',
      inputSchema: { topic_id: topicId, item_id: itemId },
      annotations: readOnly,
    },
    ({ topic_id, item_id }) => run(api('GET', `/topics/${topic_id}/items/${item_id}`)),
  )

  server.registerTool(
    'set_item_status',
    {
      title: 'Sort an item',
      description:
        'Validates, rejects, archives an item, or puts it back to sort (new). Validating starts the AI drafting. Published items cannot change.',
      inputSchema: {
        topic_id: topicId,
        item_id: itemId,
        status: z.enum(['validated', 'rejected', 'new', 'archived']),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    ({ topic_id, item_id, status }) =>
      run(api('PATCH', `/topics/${topic_id}/items/${item_id}`, { status })),
  )

  server.registerTool(
    'add_link',
    {
      title: 'Add a link',
      description:
        'Adds an article or tool to a topic by its URL. Validated by default (it was chosen by the user); the title is read from the page when not given.',
      inputSchema: {
        topic_id: topicId,
        url: z.string().url(),
        title: z.string().max(500).optional(),
        kind: z
          .string()
          .regex(KIND_KEY)
          .nullable()
          .default(null)
          .describe('A kind key of the topic (see get_topic_kinds), or null'),
        status: z.enum(['new', 'validated']).default('validated'),
      },
      annotations: { idempotentHint: true, openWorldHint: true },
    },
    ({ topic_id, ...body }) => run(api('POST', `/topics/${topic_id}/items`, body)),
  )

  server.registerTool(
    'update_summary',
    {
      title: 'Edit a summary',
      description:
        'Replaces the summary of an item in one language. Edited summaries are kept when drafting runs again.',
      inputSchema: {
        topic_id: topicId,
        item_id: itemId,
        lang: z.enum(LANGS),
        text: z.string().min(1).max(2000),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    ({ topic_id, item_id, lang, text }) =>
      run(api('PATCH', `/topics/${topic_id}/items/${item_id}/summaries/${lang}`, { text })),
  )

  server.registerTool(
    'update_post',
    {
      title: 'Edit a post',
      description:
        'Replaces the text of a post draft (post ids come from get_item). The link to the source is added after the text when published: do not include it. Possible until the post goes out.',
      inputSchema: {
        topic_id: topicId,
        post_id: z.string().uuid(),
        text: z.string().min(1).max(3000),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    ({ topic_id, post_id, text }) =>
      run(api('PATCH', `/topics/${topic_id}/posts/${post_id}`, { text })),
  )

  server.registerTool(
    'redraft_item',
    {
      title: 'Draft again',
      description:
        'Asks the AI to write the summaries and posts of a validated item again. Texts edited by hand are kept.',
      inputSchema: { topic_id: topicId, item_id: itemId },
      annotations: { openWorldHint: false },
    },
    ({ topic_id, item_id }) => run(api('POST', `/topics/${topic_id}/items/${item_id}/draft`)),
  )

  server.registerTool(
    'schedule_item',
    {
      title: 'Schedule the posts',
      description:
        'Puts the posts of a validated, drafted item on the next free slot of the topic ("next_slot"), or publishes them right away ("now"). Publishing is public: ask the user before "now".',
      inputSchema: {
        topic_id: topicId,
        item_id: itemId,
        when: z.enum(['next_slot', 'now']).default('next_slot'),
      },
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    ({ topic_id, item_id, when }) =>
      run(api('POST', `/topics/${topic_id}/items/${item_id}/schedule`, { when })),
  )

  server.registerTool(
    'unschedule_item',
    {
      title: 'Remove from the queue',
      description: 'Takes the scheduled posts of an item off the queue; they become drafts again.',
      inputSchema: { topic_id: topicId, item_id: itemId },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    ({ topic_id, item_id }) => run(api('DELETE', `/topics/${topic_id}/items/${item_id}/schedule`)),
  )

  server.registerTool(
    'get_queue',
    {
      title: 'Diffusion queue',
      description:
        'Items on the diffusion queue (upcoming slots) and those published in the last 14 days, with the status of each post.',
      inputSchema: { topic_id: topicId },
      annotations: readOnly,
    },
    ({ topic_id }) => run(api('GET', `/topics/${topic_id}/queue`)),
  )

  server.registerTool(
    'get_newsletter',
    {
      title: 'Next newsletter',
      description:
        'What the next newsletter of each language would hold now (subject, number of items, period), when the next automatic sending is, and the last issues. Read-only: sending stays in the board.',
      inputSchema: { topic_id: topicId },
      annotations: readOnly,
    },
    ({ topic_id }) =>
      run(api('GET', `/topics/${topic_id}/newsletter`), (data) => {
        const state = data as { previews: Record<string, unknown>[] }
        // The HTML of the previews is for the board; the model gets the facts.
        return { ...state, previews: state.previews.map(({ html: _html, ...rest }) => rest) }
      }),
  )

  return server
}

// ---------------------------------------------------------------------------
// HTTP: OAuth protected resource (RFC 9728) and the MCP endpoint
// ---------------------------------------------------------------------------

export const MCP_PATH = '/mcp'
const METADATA_PATH = '/.well-known/oauth-protected-resource'

/**
 * Where MCP clients learn which authorization server issues tokens for /mcp:
 * Supabase Auth (OAuth 2.1 server of the project). Its tokens are the user's Supabase
 * JWTs, so RLS applies to everything the tools do.
 */
export function protectedResourceMetadata(origin: string, env: Env) {
  return {
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: [`${env.SUPABASE_URL}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'Pann',
  }
}

export function isMcpRequest(pathname: string): boolean {
  return pathname === MCP_PATH || pathname.startsWith(METADATA_PATH)
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version',
  'Access-Control-Expose-Headers': 'WWW-Authenticate',
}

export async function handleMcp(
  request: Request,
  env: Env,
  callApi: (token: string) => ApiCall,
): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'OPTIONS')
    return new Response(null, {
      status: 204,
      headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' },
    })

  if (url.pathname.startsWith(METADATA_PATH))
    return Response.json(protectedResourceMetadata(url.origin, env), {
      headers: { ...CORS, 'Cache-Control': 'public, max-age=3600' },
    })

  // No token, or a token Supabase does not recognise: point the client to the metadata.
  const header = request.headers.get('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  const challenge = () =>
    new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer resource_metadata="${url.origin}${METADATA_PATH}${MCP_PATH}"`,
      },
    })
  if (!token) return challenge()
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.auth.getClaims(token)
  if (error || !data?.claims.sub) return challenge()

  // Stateless: GET (server-sent stream) and DELETE (session end) are not offered.
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { ...CORS, Allow: 'POST' } })

  return serveMcp(request, callApi(token))
}

/** Answers one MCP request (JSON-RPC over Streamable HTTP, stateless) for a signed-in user. */
export async function serveMcp(request: Request, api: ApiCall): Promise<Response> {
  const server = createPannServer(api)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  const response = await transport.handleRequest(request)
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  return new Response(response.body, { status: response.status, headers })
}
