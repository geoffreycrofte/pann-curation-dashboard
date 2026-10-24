import { app } from './app'
import type { Env } from './env'
import { consumeJobs, type JobMessage } from './jobs/queue'
import { runScheduled } from './jobs/scheduled'
import { handleMcp, isMcpRequest, type ApiCall } from './mcp/server'
import { feeds } from './routes/feeds'

/**
 * MCP tools go through the board API, as the user: the same routes, checks and RLS.
 * Internal call, no network hop.
 */
function apiAs(token: string, env: Env, ctx: ExecutionContext): ApiCall {
  return async (method, path, body) => {
    const res = await app.request(
      `/api${path}`,
      {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env,
      ctx,
    )
    const data = res.status === 204 ? null : await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  }
}

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url)
    // Public feeds live outside /api: no sign-in.
    if (pathname.startsWith('/feeds/')) return feeds.fetch(request, env, ctx)
    // MCP server for Claude, signed in with OAuth (Supabase Auth).
    if (isMcpRequest(pathname)) return handleMcp(request, env, (token) => apiAs(token, env, ctx))
    return app.fetch(request, env, ctx)
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller, env))
  },
  queue: consumeJobs,
} satisfies ExportedHandler<Env, JobMessage>
