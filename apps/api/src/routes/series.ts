import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { parseJson } from '../lib/validation'

const SERIES_COLUMNS =
  'id, topic_id, subject, notes, post_count, span_days, plan, status, error, created_at'

const newSeries = z.object({
  subject: z.string().trim().min(3).max(300),
  notes: z.string().max(10_000).default(''),
  post_count: z.number().int().min(2).max(8),
  span_days: z.number().int().min(1).max(60),
  ui_lang: z.enum(['fr', 'en']).default('fr'),
})
const planSchema = z
  .array(
    z.object({ subject: z.string().trim().min(1).max(300), angle: z.string().trim().max(2000) }),
  )
  .min(1)
  .max(8)

/**
 * Series of the Création tool, mounted under /topics (user's JWT, RLS). A job plans the
 * series; its posts then become compositions, drafted from their angle by jobs.
 */
export const series = new Hono<AppEnv>()
  /** Recurring questions of the conversations, ideas for posts (RLS: members read). */
  .get('/:topicId/question-ideas', async (c) => {
    const { data, error } = await c.var.db
      .from('question_ideas')
      .select('status, ideas, error, generated_at')
      .eq('topic_id', c.req.param('topicId'))
      .maybeSingle()
    if (error) throw error
    return c.json(data ?? { status: 'idle', ideas: [], error: null, generated_at: null })
  })

  /** Asks the job to look for them again (in the language of the interface). */
  .post('/:topicId/question-ideas', async (c) => {
    const { ui_lang } = await parseJson(
      z.object({ ui_lang: z.enum(['fr', 'en']).default('fr') }),
      c.req.raw,
    )
    const topicId = c.req.param('topicId')
    const { data, error } = await c.var.db.rpc('request_question_ideas', {
      p_topic_id: topicId,
      p_ui_lang: ui_lang,
    })
    if (error?.code === '42501') throw new HTTPException(404, { message: 'Topic not found' })
    if (error) throw error
    if (data) await c.env.JOBS.send({ type: 'question-ideas', topicId })
    return c.json({ queued: data === true }, 202)
  })

  .post('/:topicId/series', async (c) => {
    const body = await parseJson(newSeries, c.req.raw)
    const { data, error } = await c.var.db
      .from('series')
      .insert({ ...body, topic_id: c.req.param('topicId') })
      .select(SERIES_COLUMNS)
      .single<{ id: string }>()
    if (error) throw error
    await c.env.JOBS.send({ type: 'plan-series', seriesId: data.id })
    return c.json(data, 201)
  })

  .get('/:topicId/series/:id', async (c) => {
    const { topicId, id } = c.req.param()
    const [found, posts] = await Promise.all([
      c.var.db
        .from('series')
        .select(SERIES_COLUMNS)
        .eq('topic_id', topicId)
        .eq('id', id)
        .maybeSingle<Record<string, unknown>>(),
      c.var.db
        .from('compositions')
        .select('id, subject, status, draft_status, draft_error, publish_at, series_position')
        .eq('series_id', id)
        .order('series_position'),
    ])
    if (found.error) throw found.error
    if (posts.error) throw posts.error
    if (!found.data) throw new HTTPException(404, { message: 'Series not found' })
    return c.json({ ...found.data, compositions: posts.data })
  })

  .patch('/:topicId/series/:id', async (c) => {
    const { plan } = await parseJson(z.object({ plan: planSchema }), c.req.raw)
    const { data, error } = await c.var.db
      .from('series')
      .update({ plan })
      .eq('topic_id', c.req.param('topicId'))
      .eq('id', c.req.param('id'))
      .select(SERIES_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Series not found' })
    return c.json(data)
  })

  /** One composition per post of the plan (once), each drafted from its angle. */
  .post('/:topicId/series/:id/compositions', async (c) => {
    const { topicId, id } = c.req.param()
    const db = c.var.db
    const { data: found, error } = await db
      .from('series')
      .select('plan, status')
      .eq('topic_id', topicId)
      .eq('id', id)
      .maybeSingle<{ plan: { subject: string; angle: string }[]; status: string }>()
    if (error) throw error
    if (!found) throw new HTTPException(404, { message: 'Series not found' })
    if (found.status !== 'ready' || !found.plan.length)
      throw new HTTPException(409, { message: 'Plan not ready' })
    const { count, error: countError } = await db
      .from('compositions')
      .select('id', { count: 'exact', head: true })
      .eq('series_id', id)
    if (countError) throw countError
    if (count) throw new HTTPException(409, { message: 'Already created' })

    const { data: created, error: insertError } = await db
      .from('compositions')
      .insert(
        found.plan.map((post, index) => ({
          topic_id: topicId,
          subject: post.subject,
          mode: 'notes',
          notes: post.angle,
          series_id: id,
          series_position: index,
        })),
      )
      .select('id')
    if (insertError) throw insertError
    for (const composition of created) {
      const { data: queued, error: rpcError } = await db.rpc('request_compose_job', {
        p_composition_id: composition.id,
        p_job: 'draft',
      })
      if (rpcError) throw rpcError
      if (queued) await c.env.JOBS.send({ type: 'compose-draft', compositionId: composition.id })
    }
    return c.json({ created: created.length }, 201)
  })
