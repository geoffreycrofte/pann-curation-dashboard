import { PLATFORM_PROVIDERS, type PlatformProvider } from '@pann/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { checkCredential } from '../lib/check-credential'
import { parseJson } from '../lib/validation'

const KEY_COLUMNS = 'provider, hint, status, status_detail, checked_at, updated_at'
const SETTINGS_COLUMNS = 'onboarding_credit_usd, monthly_cap_usd, updated_at'

const keyBody = z.object({ secret: z.string().trim().min(8).max(500) })
const settingsBody = z
  .object({
    onboarding_credit_usd: z.number().min(0).max(100),
    monthly_cap_usd: z.number().min(0).max(100_000),
  })
  .partial()
const usageQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })

function platformProvider(value: string): PlatformProvider {
  if (!(PLATFORM_PROVIDERS as readonly string[]).includes(value))
    throw new HTTPException(404, { message: 'Unknown provider' })
  return value as PlatformProvider
}

/**
 * Administration of Pann, mounted under /admin: Pann's own keys and the cost centre of what
 * Pann pays. Platform admins only (a list changed in SQL); anyone else gets a 404, as if
 * the space did not exist. The database checks the role again in every function.
 */
export const admin = new Hono<AppEnv>()
  .use('/*', async (c, next) => {
    const { data, error } = await c.var.db.rpc('is_platform_admin')
    if (error) throw error
    if (data !== true) throw new HTTPException(404, { message: 'Not found' })
    await next()
  })

  .get('/credentials', async (c) => {
    const { data, error } = await c.var.db.from('platform_credentials').select(KEY_COLUMNS)
    if (error) throw error
    return c.json(data)
  })

  /** Checks the key with the provider (free call), then stores it in Supabase Vault. */
  .put('/credentials/:provider', async (c) => {
    const provider = platformProvider(c.req.param('provider'))
    const { secret } = await parseJson(keyBody, c.req.raw)
    const check = await checkCredential(provider, secret)
    if (check.status === 'invalid')
      throw new HTTPException(422, { message: `invalid_credential:${provider}` })
    const { error } = await c.var.db.rpc('set_platform_credential', {
      p_provider: provider,
      p_secret: secret,
      p_status: check.status,
      p_status_detail: check.detail,
      p_meta: check.meta ?? {},
    })
    if (error) throw error
    const { data, error: readError } = await c.var.db
      .from('platform_credentials')
      .select(KEY_COLUMNS)
      .eq('provider', provider)
      .single()
    if (readError) throw readError
    return c.json(data)
  })

  .delete('/credentials/:provider', async (c) => {
    const { error } = await c.var.db.rpc('delete_platform_credential', {
      p_provider: platformProvider(c.req.param('provider')),
    })
    if (error) throw error
    return c.body(null, 204)
  })

  .get('/settings', async (c) => {
    const { data, error } = await c.var.db
      .from('platform_settings')
      .select(SETTINGS_COLUMNS)
      .single()
    if (error) throw error
    return c.json(data)
  })

  .patch('/settings', async (c) => {
    const body = await parseJson(settingsBody, c.req.raw)
    const { data, error } = await c.var.db
      .from('platform_settings')
      .update({ ...body, updated_at: new Date().toISOString(), updated_by: c.var.user.id })
      .eq('id', true)
      .select(SETTINGS_COLUMNS)
      .single()
    if (error) throw error
    return c.json(data)
  })

  /** What Pann paid during a calendar month (UTC), per workspace, service and operation. */
  .get('/usage', async (c) => {
    const query = usageQuery.safeParse(c.req.query())
    if (!query.success) throw new HTTPException(400, { message: 'invalid_config' })
    const [year, month] = query.data.month.split('-').map(Number) as [number, number]
    const from = new Date(Date.UTC(year, month - 1, 1))
    const to = new Date(Date.UTC(year, month, 1))
    const { data, error } = await c.var.db.rpc('platform_usage', {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    })
    if (error) throw error
    return c.json(data)
  })
