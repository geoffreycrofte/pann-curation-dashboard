import { PROVIDERS, type Provider } from '@pann/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { checkCredential } from '../lib/check-credential'
import { parseJson } from '../lib/validation'

const COLUMNS = 'workspace_id, provider, hint, status, status_detail, checked_at, updated_at'
const setBody = z.object({ secret: z.string().trim().min(8).max(500) })

function provider(value: string): Provider {
  if (!(PROVIDERS as readonly string[]).includes(value))
    throw new HTTPException(404, { message: 'Unknown provider' })
  return value as Provider
}

/** Mounted under /workspaces/:workspaceId/credentials. Keys are never returned. */
export const credentials = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { data, error } = await c.var.db
      .from('workspace_credentials')
      .select(COLUMNS)
      .eq('workspace_id', c.req.param('workspaceId')!)
    if (error) throw error
    return c.json(data)
  })

  /** Checks the key with the provider (free call), then stores it in Supabase Vault. */
  .put('/:provider', async (c) => {
    const p = provider(c.req.param('provider'))
    const { secret } = await parseJson(setBody, c.req.raw)
    const check = await checkCredential(p, secret)
    if (check.status === 'invalid')
      throw new HTTPException(422, { message: `invalid_credential:${p}` })

    const { error } = await c.var.db.rpc('set_workspace_credential', {
      p_workspace_id: c.req.param('workspaceId'),
      p_provider: p,
      p_secret: secret,
      p_status: check.status,
      p_status_detail: check.detail,
    })
    if (error?.code === '42501') throw new HTTPException(403, { message: 'owner_only' })
    if (error) throw error

    const { data, error: readError } = await c.var.db
      .from('workspace_credentials')
      .select(COLUMNS)
      .eq('workspace_id', c.req.param('workspaceId')!)
      .eq('provider', p)
      .single()
    if (readError) throw readError
    return c.json(data)
  })

  .delete('/:provider', async (c) => {
    const { error } = await c.var.db.rpc('delete_workspace_credential', {
      p_workspace_id: c.req.param('workspaceId'),
      p_provider: provider(c.req.param('provider')),
    })
    if (error?.code === '42501') throw new HTTPException(403, { message: 'owner_only' })
    if (error) throw error
    return c.body(null, 204)
  })
