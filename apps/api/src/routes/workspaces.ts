import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { parseJson } from '../lib/validation'

const renameBody = z.object({ name: z.string().trim().min(1).max(100) })

/** Mounted under /workspaces. RLS: only an owner can update a workspace. */
export const workspaces = new Hono<AppEnv>()
  /** The workspace's plan, its limits and its tokens this month (members only). */
  .get('/:workspaceId/plan', async (c) => {
    const { data, error } = await c.var.db
      .rpc('workspace_plan', { p_workspace_id: c.req.param('workspaceId') })
      .maybeSingle()
    if (error?.code === '42501') throw new HTTPException(404, { message: 'Workspace not found' })
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Workspace not found' })
    const row = data as Record<string, unknown>
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
    return c.json({
      plan: row.plan,
      max_topics: num(row.max_topics),
      max_social_accounts: num(row.max_social_accounts),
      monthly_tokens: num(row.monthly_tokens),
      topics: Number(row.topics),
      month_tokens: Number(row.month_tokens),
    })
  })
  .patch('/:workspaceId', async (c) => {
    const { name } = await parseJson(renameBody, c.req.raw)
    const { data, error } = await c.var.db
      .from('workspaces')
      .update({ name })
      .eq('id', c.req.param('workspaceId'))
      .select('id, name')
      .maybeSingle()
    if (error) throw error
    // A member who is not the owner sees the workspace but cannot update it.
    if (!data) throw new HTTPException(403, { message: 'owner_only' })
    return c.json(data)
  })
