import {
  blueskySourceConfigSchema,
  engagementSourceConfigSchemas,
  exaSourceConfigSchema,
  githubSourceConfigSchema,
  hackerNewsSourceConfigSchema,
  MAX_INTERVAL_HOURS,
  MIN_INTERVAL_HOURS,
  moduleOfSourceType,
  searchSourceConfigSchemas,
  TOPIC_MODULES,
  type SourceType,
} from '@pann/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { resolveFeed } from '../lib/feeds'
import { checkKind, kindKey } from '../lib/kinds'
import { parseJson } from '../lib/validation'

const SOURCE_COLUMNS =
  'id, topic_id, module, type, label, config, active, default_kind, interval_hours, last_run_at, last_error, run_requested_at, last_run_stats, created_at'

const interval = z.number().int().min(MIN_INTERVAL_HOURS).max(MAX_INTERVAL_HOURS).nullable()

const addRssBody = z.object({
  url: z.url({ protocol: /^https?$/ }),
  label: z.string().trim().max(200).optional(),
  default_kind: kindKey.nullable().default(null),
  interval_hours: interval.default(null),
})

const searchCommon = {
  label: z.string().trim().min(1).max(200),
  default_kind: kindKey.nullable().default(null),
  interval_hours: interval.default(null),
}
/** Searches: Exa and GitHub (curation), Hacker News and Bluesky (engagement). */
const addSearchBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('exa'), config: exaSourceConfigSchema, ...searchCommon }),
  z.object({ type: z.literal('github'), config: githubSourceConfigSchema, ...searchCommon }),
  z.object({
    type: z.literal('hackernews'),
    config: hackerNewsSourceConfigSchema,
    ...searchCommon,
  }),
  z.object({ type: z.literal('bluesky'), config: blueskySourceConfigSchema, ...searchCommon }),
])

/** Config schema of the sources whose settings can be edited (all but RSS). */
const configSchemas: Partial<Record<SourceType, z.ZodType>> = {
  ...searchSourceConfigSchemas,
  ...engagementSourceConfigSchemas,
}

const listQuery = z.object({ module: z.enum(TOPIC_MODULES).optional() })

const updateBody = z
  .object({
    label: z.string().trim().min(1).max(200),
    active: z.boolean(),
    default_kind: kindKey.nullable(),
    interval_hours: interval,
    /** Search sources only; validated against the schema of the source type. */
    config: z.record(z.string(), z.unknown()),
  })
  .partial()

/** Mounted under /topics/:topicId/sources. RLS restricts everything to the user's topics. */
export const sources = new Hono<AppEnv>()
  .get('/', async (c) => {
    const query = listQuery.safeParse(c.req.query())
    if (!query.success) throw new HTTPException(400, { message: 'invalid_config' })
    let request = c.var.db
      .from('sources')
      .select(SOURCE_COLUMNS)
      .eq('topic_id', c.req.param('topicId')!)
      .order('created_at')
    if (query.data.module) request = request.eq('module', query.data.module)
    const { data, error } = await request
    if (error) throw error
    return c.json(data)
  })

  /**
   * Adds an RSS/Atom feed. `url` may be the feed itself or a page that declares it.
   * When a page declares several feeds, nothing is created and the candidates are returned.
   */
  .post('/rss', async (c) => {
    const body = await parseJson(addRssBody, c.req.raw)
    await checkKind(c.var.db, c.req.param('topicId')!, body.default_kind)
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

  /** Adds a search: Exa or GitHub (curation), Hacker News or Bluesky (engagement). */
  .post('/', async (c) => {
    const body = await parseJson(addSearchBody, c.req.raw)
    await checkKind(c.var.db, c.req.param('topicId')!, body.default_kind)
    const { data, error } = await c.var.db
      .from('sources')
      // The tool a source feeds follows from its type: conversations go to engagement.
      .insert({ topic_id: c.req.param('topicId')!, module: moduleOfSourceType(body.type), ...body })
      .select(SOURCE_COLUMNS)
      .single()
    if (error) throw error
    return c.json(data, 201)
  })

  .patch('/:sourceId', async (c) => {
    const { config, ...rest } = await parseJson(updateBody, c.req.raw)
    await checkKind(c.var.db, c.req.param('topicId')!, rest.default_kind)
    const body: Record<string, unknown> = rest
    if (config) {
      const { data: current, error: readError } = await c.var.db
        .from('sources')
        .select('type')
        .eq('topic_id', c.req.param('topicId')!)
        .eq('id', c.req.param('sourceId'))
        .maybeSingle()
      if (readError) throw readError
      if (!current) throw new HTTPException(404, { message: 'Source not found' })
      // A feed keeps its URL: changing it means adding another source.
      const schema = configSchemas[current.type as SourceType]
      if (!schema) throw new HTTPException(400, { message: 'invalid_config' })
      const parsed = schema.safeParse(config)
      if (!parsed.success) throw new HTTPException(400, { message: 'invalid_config' })
      body.config = parsed.data
    }
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
   * matches their own sources); the collection itself then runs as a queued job,
   * with the secret key. The board polls until last_run_at moves.
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
    await c.env.JOBS.send({ type: 'collect-source', sourceId: data.id })
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
