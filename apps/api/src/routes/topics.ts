import {
  canTransition,
  extractPageTitle,
  ITEM_KINDS,
  ITEM_TOPIC_STATUSES,
  normalizeUrl,
  parseTopicConfig,
  topicConfigSchema,
  type ItemTopicStatus,
} from '@pann/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { fetchText } from '../lib/fetch-text'
import { parseJson } from '../lib/validation'

const TOPIC_COLUMNS = 'id, workspace_id, slug, name_fr, name_en, active, monthly_budget_usd'

const listQuery = z.object({
  status: z.enum(ITEM_TOPIC_STATUSES).default('new'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const statusBody = z.object({ status: z.enum(ITEM_TOPIC_STATUSES) })

/** Top-level keys of the topic config are replaced as a whole, then the result is validated. */
const configPatch = z.record(z.string(), z.unknown())

const manualItemBody = z.object({
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().trim().max(500).optional(),
  kind: z.enum(ITEM_KINDS).nullable().default(null),
  status: z.enum(['new', 'validated']).default('validated'),
})

export const topics = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { data, error } = await c.var.db.from('topics').select(TOPIC_COLUMNS).order('created_at')
    if (error) throw error
    return c.json(data)
  })

  .get('/:topicId', async (c) => {
    const { data, error } = await c.var.db
      .from('topics')
      .select(`${TOPIC_COLUMNS}, config`)
      .eq('id', c.req.param('topicId'))
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Topic not found' })
    return c.json({ ...data, config: parseTopicConfig(data.config) })
  })

  .patch('/:topicId/config', async (c) => {
    const patch = await parseJson(configPatch, c.req.raw)
    const topicId = c.req.param('topicId')
    const { data: current, error: readError } = await c.var.db
      .from('topics')
      .select('config')
      .eq('id', topicId)
      .maybeSingle()
    if (readError) throw readError
    if (!current) throw new HTTPException(404, { message: 'Topic not found' })

    const next = topicConfigSchema.safeParse({ ...(current.config as object), ...patch })
    if (!next.success) throw new HTTPException(400, { message: z.prettifyError(next.error) })

    const { error } = await c.var.db.from('topics').update({ config: next.data }).eq('id', topicId)
    if (error) throw error
    return c.json(next.data)
  })

  .get('/:topicId/items', async (c) => {
    const query = listQuery.safeParse(c.req.query())
    if (!query.success) throw new HTTPException(400, { message: z.prettifyError(query.error) })
    const { status, limit, offset } = query.data

    const { data, error } = await c.var.db
      .from('item_topics')
      .select(
        'item_id, topic_id, relevance_score, is_commercial, triage_reason, status, validated_at, ' +
          'item:items (canonical_url, title, source_lang, kind, origin, published_at, discovered_at)',
      )
      .eq('topic_id', c.req.param('topicId'))
      .eq('status', status)
      .order('relevance_score', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) throw error
    return c.json(data)
  })

  /**
   * Adds an article or tool by hand. Validated by default (the user chose it);
   * the AI pipeline will still classify and summarise it.
   */
  .post('/:topicId/items', async (c) => {
    const body = await parseJson(manualItemBody, c.req.raw)
    const canonicalUrl = normalizeUrl(body.url)

    let title = body.title
    if (!title) {
      // Best effort: a missing title falls back to the URL in the database function.
      title = await fetchText(body.url, { maxBytes: 128 * 1024 })
        .then((page) => extractPageTitle(page.text) ?? undefined)
        .catch(() => undefined)
    }

    const { data, error } = await c.var.db
      .rpc('add_manual_item', {
        p_topic_id: c.req.param('topicId'),
        p_canonical_url: canonicalUrl,
        p_title: title ?? '',
        p_kind: body.kind,
        p_status: body.status,
      })
      .single<{ item_id: string; status: ItemTopicStatus; created: boolean }>()
    if (error?.code === '42501') throw new HTTPException(404, { message: 'Topic not found' })
    if (error) throw error
    return c.json({ ...data, canonical_url: canonicalUrl, title }, data.created ? 201 : 200)
  })

  .patch('/:topicId/items/:itemId', async (c) => {
    const { status: target } = await parseJson(statusBody, c.req.raw)
    const { topicId, itemId } = c.req.param()

    const { data: current, error: readError } = await c.var.db
      .from('item_topics')
      .select('status')
      .eq('topic_id', topicId)
      .eq('item_id', itemId)
      .maybeSingle<{ status: ItemTopicStatus }>()
    if (readError) throw readError
    if (!current) throw new HTTPException(404, { message: 'Item not found in this topic' })
    if (!canTransition(current.status, target)) {
      throw new HTTPException(409, { message: `Cannot go from ${current.status} to ${target}` })
    }

    // validated_at is maintained by the database trigger.
    const { data, error } = await c.var.db
      .from('item_topics')
      .update({ status: target })
      .eq('topic_id', topicId)
      .eq('item_id', itemId)
      .eq('status', current.status) // optimistic lock
      .select('item_id, topic_id, status, validated_at')
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(409, { message: 'Status changed meanwhile, reload' })
    return c.json(data)
  })
