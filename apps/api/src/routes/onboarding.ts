import { HTTPException } from 'hono/http-exception'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { parseJson } from '../lib/validation'

const SESSION_COLUMNS = 'id, workspace_id, context, messages, proposal, status, error, updated_at'

const contextSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.url().max(500).optional(),
  tools: z.array(z.enum(['curation', 'engagement'])).max(2),
  channels: z.array(z.string().max(30)).max(10),
  listen: z.array(z.string().max(30)).max(10),
  newsletter: z.boolean().optional(),
  ui_lang: z.enum(['fr', 'en']),
})

const newSession = z.object({ workspace_id: z.uuid(), context: contextSchema })
const newMessage = z.object({ text: z.string().trim().min(1).max(2000) })

/** Questions after which the person can only go on to the review. */
const MAX_USER_MESSAGES = 10

/**
 * Onboarding conversation. Every request goes through the RLS (own sessions, in a
 * workspace the user belongs to); a job answers on Pann's key, and the board polls.
 */
export const onboarding = new Hono<AppEnv>()
  .get('/available', async (c) => {
    const workspaceId = z.uuid().safeParse(c.req.query('workspace_id'))
    if (!workspaceId.success) throw new HTTPException(400, { message: 'workspace_id' })
    const { data, error } = await c.var.db.rpc('onboarding_available', {
      p_workspace_id: workspaceId.data,
    })
    if (error) throw error
    return c.json({ available: data === true })
  })

  .post('/sessions', async (c) => {
    const body = await parseJson(newSession, c.req.raw)
    const { data: available, error: availableError } = await c.var.db.rpc('onboarding_available', {
      p_workspace_id: body.workspace_id,
    })
    if (availableError) throw availableError
    if (available !== true) throw new HTTPException(409, { message: 'onboarding_unavailable' })
    const { data, error } = await c.var.db
      .from('onboarding_sessions')
      .insert({ workspace_id: body.workspace_id, context: body.context })
      .select(SESSION_COLUMNS)
      .single()
    if (error) throw error
    await c.env.JOBS.send({ type: 'onboarding', sessionId: data.id })
    return c.json(data, 201)
  })

  .get('/sessions/:id', async (c) => {
    const { data, error } = await c.var.db
      .from('onboarding_sessions')
      .select(SESSION_COLUMNS)
      .eq('id', c.req.param('id'))
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Session not found' })
    return c.json(data)
  })

  /** The person's answer; the session waits for the next question (or a retry). */
  .post('/sessions/:id/messages', async (c) => {
    const body = await parseJson(newMessage, c.req.raw)
    const { data: session, error } = await c.var.db
      .from('onboarding_sessions')
      .select('id, messages, status')
      .eq('id', c.req.param('id'))
      .maybeSingle<{ id: string; messages: { role: string }[]; status: string }>()
    if (error) throw error
    if (!session) throw new HTTPException(404, { message: 'Session not found' })
    if (session.status === 'pending' || session.status === 'done')
      throw new HTTPException(409, { message: `Session is ${session.status}` })
    if (session.messages.filter((m) => m.role === 'user').length >= MAX_USER_MESSAGES)
      throw new HTTPException(409, { message: 'Session is over' })
    const { data, error: updateError } = await c.var.db
      .from('onboarding_sessions')
      .update({
        messages: [...session.messages, { role: 'user', text: body.text }],
        status: 'pending',
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id)
      .eq('status', session.status)
      .select(SESSION_COLUMNS)
      .maybeSingle()
    if (updateError) throw updateError
    if (!data) throw new HTTPException(409, { message: 'Session changed' })
    await c.env.JOBS.send({ type: 'onboarding', sessionId: session.id })
    return c.json(data, 202)
  })

  /** After a failure: the same last message is asked again. */
  .post('/sessions/:id/retry', async (c) => {
    const { data, error } = await c.var.db
      .from('onboarding_sessions')
      .update({ status: 'pending', error: null, updated_at: new Date().toISOString() })
      .eq('id', c.req.param('id'))
      .eq('status', 'failed')
      .select(SESSION_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(409, { message: 'Nothing to retry' })
    await c.env.JOBS.send({ type: 'onboarding', sessionId: data.id })
    return c.json(data, 202)
  })
