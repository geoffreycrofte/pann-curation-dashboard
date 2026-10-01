import { ITEM_KINDS, MAX_INTERVAL_HOURS, MIN_INTERVAL_HOURS } from '@pann/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { resolveFeed } from '../lib/feeds'
import { parseJson } from '../lib/validation'
import { collectSourceNow } from '../jobs/scheduled'

const SOURCE_COLUMNS =
  'id, topic_id, type, label, config, active, default_kind, interval_hours, last_run_at, last_error, run_requested_at, last_run_stats, created_at'

const interval = z.number().int().min(MIN_INTERVAL_HOURS).max(MAX_INTERVAL_HOURS).nullable()

const addRssBody = z.object({
  url: z.url({ protocol: /^https?$/ }),
  label: z.string().trim().max(200).optional(),
  default_kind: z.enum(ITEM_KINDS).nullable().default(null),
  interval_hours: interval.default(null),
})

const updateBody = z
  .object({
    label: z.string().trim().min(1).max(200),
    active: z.boolean(),
    default_kind: z.enum(ITEM_KINDS).nullable(),
    interval_hours: interval,
  })
  .partial()

/** Mounted under /topics/:topicId/sources. RLS restricts everything to the user's topics. */
export const sources = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { data, error } = await c.var.db
      .from('sources')
      .select(SOURCE_COLUMNS)
      .eq('topic_id', c.req.param('topicId')!)
      .order('created_at')
    if (error) throw error
    return c.json(data)
  })

  /**
   * Adds an RSS/Atom feed. `url` may be the feed itself or a page that declares it.
   * When a page declares several feeds, nothing is created and the candidates are returned.
   */
  .post('/rss', async (c) => {
    const body = await parseJson(addRssBody, c.req.raw)
    const resolved = await resolveFeed(body.url)
    if (resolved.kind === 'none') throw new HTTPException(422, { message: resolved.reason })
    if (resolved.kind === 'choose')
      return c.json({ status: 'choose', candidates: resolved.candidates })

    const { data, error } = await c.var.db
      .from('sources')
      .insert({
        topic_id: c.req.param('topicId')!,
        type: 'rss',
        label: body.label || resolved.title || new URL(resolved.url).hostname,
        config: { url: resolved.url, format: resolved.format },
        default_kind: body.default_kind,
        interval_hours: body.interval_hours,
      })
      .select(SOURCE_COLUMNS)
      .single()
    if (error?.code === '23505')
      throw new HTTPException(409, { message: 'This feed is already a source of this topic' })
    if (error) throw error
    return c.json({ status: 'created', source: data }, 201)
  })

  .patch('/:sourceId', async (c) => {
    const body = await parseJson(updateBody, c.req.raw)
    const { data, error } = await c.var.db
      .from('sources')
      .update(body)
      .eq('topic_id', c.req.param('topicId')!)
      .eq('id', c.req.param('sourceId'))
      .select(SOURCE_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Source not found' })
    return c.json(data)
  })

  /**
   * "Collect now". RLS first proves the user can access the source (the update only
   * matches their own sources); the collection itself then runs in the background
   * as a job, with the secret key. The board polls until last_run_at moves.
   */
  .post('/:sourceId/collect', async (c) => {
    const { data, error } = await c.var.db
      .from('sources')
      .update({ run_requested_at: new Date().toISOString() })
      .eq('topic_id', c.req.param('topicId')!)
      .eq('id', c.req.param('sourceId'))
      .select(SOURCE_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Source not found' })
    c.executionCtx.waitUntil(collectSourceNow(c.env, data.id))
    return c.json(data, 202)
  })

  .delete('/:sourceId', async (c) => {
    const { data, error } = await c.var.db
      .from('sources')
      .delete()
      .eq('topic_id', c.req.param('topicId')!)
      .eq('id', c.req.param('sourceId'))
      .select('id')
    if (error) throw error
    if (!data.length) throw new HTTPException(404, { message: 'Source not found' })
    return c.body(null, 204)
  })
