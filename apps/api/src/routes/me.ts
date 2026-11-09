import { Hono } from 'hono'
import type { AppEnv } from '../env'

export const me = new Hono<AppEnv>().get('/', async (c) => {
  // RLS shows every membership of the user's workspaces: keep the user's own.
  const { data, error } = await c.var.db
    .from('workspace_members')
    .select('role, workspace:workspaces (id, name)')
    .eq('user_id', c.var.user.id)
  if (error) throw error
  return c.json({ user: c.var.user, workspaces: data })
})
