import { ZERNIO_PLATFORMS } from '@glimr/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { parseJson } from '../lib/validation'

const LINK_COLUMNS =
  'enabled, profile_id, accounts, refreshed_at, status, connect_platform, connect_url, error'

/**
 * Zernio in platform mode, mounted under /workspaces (user's JWT, RLS: members). The key
 * is Glimr's: jobs only. A request marks what to prepare, then queues the job.
 */
export const zernioPlatform = new Hono<AppEnv>()
  .get('/:workspaceId/zernio-platform', async (c) => {
    const { data, error } = await c.var.db
      .from('zernio_platform_links')
      .select(LINK_COLUMNS)
      .eq('workspace_id', c.req.param('workspaceId'))
      .maybeSingle()
    if (error) throw error
    return c.json(data ?? { enabled: false, accounts: [], status: 'idle' })
  })

  /**
   * Prepares the link to connect a LinkedIn account or a Facebook Page. The person comes
   * back to the Connections page of this same site: the return address is built here,
   * never taken from the request.
   */
  .post('/:workspaceId/zernio-platform/connect', async (c) => {
    const { platform } = await parseJson(
      z.object({ platform: z.enum(Object.keys(ZERNIO_PLATFORMS) as ['linkedin', 'facebook']) }),
      c.req.raw,
    )
    const workspaceId = c.req.param('workspaceId')
    // The plan caps the LinkedIn and Facebook accounts connected through Glimr's Zernio.
    const [plan, link] = await Promise.all([
      c.var.db.rpc('workspace_plan', { p_workspace_id: workspaceId }).maybeSingle(),
      c.var.db
        .from('zernio_platform_links')
        .select('accounts')
        .eq('workspace_id', workspaceId)
        .maybeSingle<{ accounts: { active: boolean }[] }>(),
    ])
    if (plan.error?.code === '42501')
      throw new HTTPException(404, { message: 'Workspace not found' })
    if (plan.error) throw plan.error
    if (link.error) throw link.error
    const max = (plan.data as { max_social_accounts: number | null } | null)?.max_social_accounts
    const connected = (link.data?.accounts ?? []).filter((a) => a.active !== false).length
    if (max !== null && max !== undefined && connected >= max)
      throw new HTTPException(409, { message: 'plan_account_limit' })
    const redirect = `${new URL(c.req.url).origin}/connections?zernio=connected`
    const { data, error } = await c.var.db.rpc('request_zernio_platform', {
      p_workspace_id: workspaceId,
      p_platform: platform,
      p_redirect_url: redirect,
    })
    if (error?.code === '42501') throw new HTTPException(404, { message: 'Workspace not found' })
    if (error) throw error
    if (!data) throw new HTTPException(409, { message: 'Not available' })
    await c.env.JOBS.send({ type: 'zernio-platform', workspaceId })
    return c.json({ queued: true }, 202)
  })

  /** Lists the accounts of the workspace's profile again (after a connection). */
  .post('/:workspaceId/zernio-platform/refresh', async (c) => {
    const workspaceId = c.req.param('workspaceId')
    const { data, error } = await c.var.db.rpc('request_zernio_platform', {
      p_workspace_id: workspaceId,
      p_platform: null,
      p_redirect_url: null,
    })
    if (error?.code === '42501') throw new HTTPException(404, { message: 'Workspace not found' })
    if (error) throw error
    if (data) await c.env.JOBS.send({ type: 'zernio-platform', workspaceId })
    return c.json({ queued: data === true }, 202)
  })
