import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { parseJson } from '../lib/validation'

const renameBody = z.object({ name: z.string().trim().min(1).max(100) })
const planChoiceBody = z.object({ plan: z.enum(['own_keys', 'essential', 'pro']) })
const billingBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('checkout'),
    plan: z.enum(['own_keys', 'essential', 'pro']),
    interval: z.enum(['month', 'year']),
    /** Board page to come back to, from the root ("/profile"). */
    return_path: z
      .string()
      .regex(/^\/[^/\\]/)
      .max(300),
  }),
  z.object({
    kind: z.literal('portal'),
    return_path: z
      .string()
      .regex(/^\/[^/\\]/)
      .max(300),
  }),
])

/** Mounted under /workspaces. RLS: only an owner can update a workspace. */
export const workspaces = new Hono<AppEnv>()
  /** The people of the workspace, with their address (members only). */
  .get('/:workspaceId/members', async (c) => {
    const { data, error } = await c.var.db.rpc('workspace_members_list', {
      p_workspace_id: c.req.param('workspaceId'),
    })
    if (error?.code === '42501') throw new HTTPException(404, { message: 'Workspace not found' })
    if (error) throw error
    return c.json(data ?? [])
  })

  /** The owner hands the workspace to another member, and stays as an editor. */
  .post('/:workspaceId/transfer', async (c) => {
    const { user_id } = await parseJson(z.object({ user_id: z.uuid() }), c.req.raw)
    const { error } = await c.var.db.rpc('transfer_workspace_ownership', {
      p_workspace_id: c.req.param('workspaceId'),
      p_new_owner: user_id,
    })
    if (error?.code === '42501') throw new HTTPException(403, { message: 'owner_only' })
    if (error?.code === '22023') throw new HTTPException(409, { message: 'not_a_member' })
    if (error) throw error
    return c.body(null, 204)
  })

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
      billing_status: row.billing_status,
      trial_ends_at: row.trial_ends_at,
      plan_chosen_at: row.plan_chosen_at,
      billing_interval: row.billing_interval,
      current_period_end: row.current_period_end,
      active: row.active,
      subscribed: row.subscribed,
    })
  })

  /** The owner picks the offer of the trial (before paying). */
  .put('/:workspaceId/plan-choice', async (c) => {
    const { plan } = await parseJson(planChoiceBody, c.req.raw)
    const { error } = await c.var.db.rpc('choose_trial_plan', {
      p_workspace_id: c.req.param('workspaceId'),
      p_plan: plan,
    })
    if (error?.code === '42501') throw new HTTPException(403, { message: 'owner_only' })
    if (error?.message === 'subscribed') throw new HTTPException(409, { message: 'subscribed' })
    if (error) throw error
    return c.json({ plan })
  })

  /**
   * Payment: the owner asks for the Stripe page (subscribe, or manage the subscription). The
   * request is recorded with RLS (owners only), then a job opens the page with Glimr's key.
   */
  .post('/:workspaceId/billing', async (c) => {
    const body = await parseJson(billingBody, c.req.raw)
    const origin = new URL(c.req.url).origin
    const { data, error } = await c.var.db
      .from('billing_requests')
      .insert({
        workspace_id: c.req.param('workspaceId'),
        kind: body.kind,
        plan: body.kind === 'checkout' ? body.plan : null,
        billing_interval: body.kind === 'checkout' ? body.interval : null,
        // The board's own address: Stripe never sends the person elsewhere.
        return_url: `${origin}${body.return_path}`,
      })
      .select('id')
      .single()
    if (error?.code === '42501') throw new HTTPException(403, { message: 'owner_only' })
    if (error) throw error
    await c.env.JOBS.send({ type: 'billing', requestId: data.id })
    return c.json({ id: data.id, status: 'pending' }, 202)
  })

  .get('/:workspaceId/billing/:requestId', async (c) => {
    const { data, error } = await c.var.db
      .from('billing_requests')
      .select('id, status, url, error')
      .eq('id', c.req.param('requestId'))
      .eq('workspace_id', c.req.param('workspaceId'))
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Not found' })
    return c.json(data)
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
