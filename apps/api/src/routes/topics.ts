import { canTransition, ITEM_TOPIC_STATUSES, type ItemTopicStatus } from '@pann/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'

const listQuery = z.object({
  status: z.enum(ITEM_TOPIC_STATUSES).default('new'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const statusBody = z.object({ status: z.enum(ITEM_TOPIC_STATUSES) })

export const topics = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { data, error } = await c.var.db
      .from('topics')
      .select('id, workspace_id, slug, name_fr, name_en, active, monthly_budget_usd')
      .order('created_at')
    if (error) throw error
    return c.json(data)
  })

  .get('/:topicId/items', async (c) => {
    const query = listQuery.safeParse(c.req.query())
    if (!query.success) throw new HTTPException(400, { message: query.error.message })
    const { status, limit, offset } = query.data

    const { data, error } = await c.var.db
      .from('item_topics')
      .select(
        'item_id, topic_id, relevance_score, status, validated_at, ' +
          'item:items (canonical_url, title, source_lang, kind, published_at, discovered_at)',
      )
      .eq('topic_id', c.req.param('topicId'))
      .eq('status', status)
      .order('relevance_score', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)
    if (error) throw error
    return c.json(data)
  })

  .patch('/:topicId/items/:itemId', async (c) => {
    const body = statusBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) throw new HTTPException(400, { message: body.error.message })
    const { topicId, itemId } = c.req.param()
    const target = body.data.status

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

    const { data, error } = await c.var.db
      .from('item_topics')
      .update({
        status: target,
        validated_at: target === 'validated' ? new Date().toISOString() : null,
      })
      .eq('topic_id', topicId)
      .eq('item_id', itemId)
      .eq('status', current.status) // optimistic lock
      .select('item_id, topic_id, status, validated_at')
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(409, { message: 'Status changed meanwhile, reload' })
    return c.json(data)
  })
