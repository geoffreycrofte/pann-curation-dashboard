import { Hono } from 'hono'
import type { AppEnv } from '../env'

export const me = new Hono<AppEnv>().get('/', async (c) => {
  // RLS shows every membership of the user's workspaces: keep the user's own.
  const [members, admin] = await Promise.all([
    c.var.db
      .from('workspace_members')
      .select('role, workspace:workspaces (id, name)')
      .eq('user_id', c.var.user.id),
    c.var.db.rpc('is_platform_admin'),
  ])
  if (members.error) throw members.error
  // The admin space link is only shown to platform admins (the API checks again).
  return c.json({
    user: c.var.user,
    workspaces: members.data,
    is_platform_admin: admin.data === true,
  })
})
