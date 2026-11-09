import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { parseJson } from '../lib/validation'

/** The person types their email address to confirm: a deletion cannot be undone. */
const deleteBody = z.object({ confirm_email: z.string().trim().toLowerCase() })

/** Mounted under /account: the signed-in person's own account. */
export const account = new Hono<AppEnv>().delete('/', async (c) => {
  const { confirm_email } = await parseJson(deleteBody, c.req.raw)
  const user = c.var.user
  if (!user.email || confirm_email !== user.email.toLowerCase())
    throw new HTTPException(400, { message: 'confirmation_mismatch' })

  // RLS lets a member read every membership of their workspaces: an owned workspace
  // with other members blocks the deletion (no transfer of ownership yet).
  const { data: memberships, error } = await c.var.db
    .from('workspace_members')
    .select('workspace_id, user_id, role')
  if (error) throw error
  const owned = new Set(
    memberships
      .filter((m) => m.user_id === user.id && m.role === 'owner')
      .map((m) => m.workspace_id),
  )
  if (memberships.some((m) => owned.has(m.workspace_id) && m.user_id !== user.id))
    throw new HTTPException(409, { message: 'workspace_has_members' })

  // The deletion needs the secret key: a job does it, for this user only.
  await c.env.JOBS.send({ type: 'delete-account', userId: user.id })
  return c.body(null, 202)
})
