import { PLANS, PLATFORM_PROVIDERS, type PlatformProvider } from '@pann/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { checkCredential } from '../lib/check-credential'
import { checkResendKey } from '../lib/resend'
import { parseJson } from '../lib/validation'

const KEY_COLUMNS = 'provider, hint, status, status_detail, checked_at, updated_at'
const SETTINGS_COLUMNS = 'onboarding_credit_usd, monthly_cap_usd, email_from, updated_at'
const REQUEST_COLUMNS =
  'id, name, email, motivation, lang, status, notified_at, notify_error, handled_at, created_at'

const keyBody = z.object({ secret: z.string().trim().min(8).max(500) })
const settingsBody = z
  .object({
    onboarding_credit_usd: z.number().min(0).max(100),
    monthly_cap_usd: z.number().min(0).max(100_000),
    /** Sender of the service emails: "Pann <noreply@example.org>" on a Resend domain. */
    email_from: z.union([
      z.literal(''),
      z
        .string()
        .trim()
        .max(200)
        .regex(/^[^<>]*<?[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>?$/),
    ]),
  })
  .partial()
const handleBody = z.object({ status: z.enum(['new', 'accepted', 'declined']) })
const limitsBody = z.object({
  max_topics: z.number().int().min(1).max(1000).nullable(),
  max_social_accounts: z.number().int().min(1).max(1000).nullable(),
  monthly_tokens: z.number().int().min(1).max(10_000_000_000).nullable(),
})
const workspacePlanBody = z.object({
  plan: z.enum(PLANS),
  /** Only for the custom plan. */
  limits: limitsBody.partial().default({}),
})
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
    const check =
      provider === 'resend' ? await checkResendKey(secret) : await checkCredential(provider, secret)
    if (check.status === 'invalid')
      throw new HTTPException(422, { message: `invalid_credential:${provider}` })
    const { error } = await c.var.db.rpc('set_platform_credential', {
      p_provider: provider,
      p_secret: secret,
      p_status: check.status,
      p_status_detail: check.detail,
      p_meta: 'meta' in check ? (check.meta ?? {}) : {},
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

  /** Per workspace over a calendar month (UTC): calls, costs and posts, for cost per post. */
  .get('/workspace-stats', async (c) => {
    const query = usageQuery.safeParse(c.req.query())
    if (!query.success) throw new HTTPException(400, { message: 'invalid_config' })
    const [year, month] = query.data.month.split('-').map(Number) as [number, number]
    const { data, error } = await c.var.db.rpc('platform_workspace_stats', {
      p_from: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
      p_to: new Date(Date.UTC(year, month, 1)).toISOString(),
    })
    if (error) throw error
    return c.json(data)
  })

  /** The offers and their limits. */
  .get('/plans', async (c) => {
    const { data, error } = await c.var.db
      .from('plans')
      .select('key, max_topics, max_social_accounts, monthly_tokens, updated_at')
    if (error) throw error
    return c.json(PLANS.map((key) => data.find((p) => p.key === key)).filter(Boolean))
  })

  /** Limits of an offer (custom excepted: set per workspace). */
  .patch('/plans/:key', async (c) => {
    const key = c.req.param('key')
    if (!(PLANS as readonly string[]).includes(key) || key === 'custom')
      throw new HTTPException(404, { message: 'Plan not found' })
    const body = await parseJson(limitsBody, c.req.raw)
    const { data, error } = await c.var.db
      .from('plans')
      .update({ ...body, updated_at: new Date().toISOString(), updated_by: c.var.user.id })
      .eq('key', key)
      .select('key, max_topics, max_social_accounts, monthly_tokens, updated_at')
      .maybeSingle()
    if (error) throw error
    // RLS: only platform admins update plans; anyone else updates nothing.
    if (!data) throw new HTTPException(404, { message: 'Plan not found' })
    return c.json(data)
  })

  /** Sets a workspace's offer (until payment does it). */
  .put('/workspaces/:workspaceId/plan', async (c) => {
    const body = await parseJson(workspacePlanBody, c.req.raw)
    const { error } = await c.var.db.rpc('set_workspace_plan', {
      p_workspace_id: c.req.param('workspaceId'),
      p_plan: body.plan,
      p_limits: body.limits,
    })
    if (error?.code === 'P0002') throw new HTTPException(404, { message: 'Workspace not found' })
    if (error) throw error
    return c.json({ plan: body.plan })
  })

  /** Access requests, newest first (the last 200). */
  .get('/access-requests', async (c) => {
    const { data, error } = await c.var.db
      .from('access_requests')
      .select(REQUEST_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    return c.json(data)
  })

  /** Marks a request as accepted or declined (the invitation itself is sent from Supabase). */
  .patch('/access-requests/:id', async (c) => {
    const { status } = await parseJson(handleBody, c.req.raw)
    const handled = status !== 'new'
    const { data, error } = await c.var.db
      .from('access_requests')
      .update({
        status,
        handled_at: handled ? new Date().toISOString() : null,
        handled_by: handled ? c.var.user.id : null,
      })
      .eq('id', c.req.param('id'))
      .select(REQUEST_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Not found' })
    return c.json(data)
  })

  /** Requests made from the product (another network, a coming tool), newest first. */
  /** Workspaces, and whether their LinkedIn and Facebook go through Pann's Zernio. */
  .get('/workspaces', async (c) => {
    const { data, error } = await c.var.db.rpc('admin_workspaces')
    if (error) throw error
    return c.json(data)
  })

  .put('/workspaces/:id/zernio-platform', async (c) => {
    const { enabled } = await parseJson(z.object({ enabled: z.boolean() }), c.req.raw)
    const { error } = await c.var.db.rpc('set_zernio_platform', {
      p_workspace_id: c.req.param('id'),
      p_enabled: enabled,
    })
    if (error) throw error
    return c.json({ enabled })
  })

  .get('/feature-requests', async (c) => {
    const { data, error } = await c.var.db
      .from('feature_requests')
      .select('id, kind, subject, status, created_at, workspace:workspaces (name)')
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) throw error
    return c.json(data)
  })

  .patch('/feature-requests/:id', async (c) => {
    const { status } = await parseJson(
      z.object({ status: z.enum(['new', 'planned', 'answered', 'declined']) }),
      c.req.raw,
    )
    const { data, error } = await c.var.db
      .from('feature_requests')
      .update({ status })
      .eq('id', c.req.param('id'))
      .select('id, status')
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Not found' })
    return c.json(data)
  })
