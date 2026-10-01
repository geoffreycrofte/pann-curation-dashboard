import { Hono } from 'hono'
import type { AppEnv } from '../env'

export const me = new Hono<AppEnv>().get('/', async (c) => {
  const { data, error } = await c.var.db
    .from('workspace_members')
    .select('role, workspace:workspaces (id, name)')
  if (error) throw error
  return c.json({ user: c.var.user, workspaces: data })
})
