import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { parseJson } from '../lib/validation'

const renameBody = z.object({ name: z.string().trim().min(1).max(100) })

/** Mounted under /workspaces. RLS: only an owner can update a workspace. */
export const workspaces = new Hono<AppEnv>().patch('/:workspaceId', async (c) => {
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
