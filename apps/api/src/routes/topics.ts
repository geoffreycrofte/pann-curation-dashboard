import {
  canTransition,
  LANGS,
  extractPageTitle,
  newFeedKey,
  ITEM_KINDS,
  ITEM_TOPIC_STATUSES,
  normalizeUrl,
  parseTopicConfig,
  slugify,
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

const feedBody = z.object({ enabled: z.boolean(), regenerate: z.boolean().default(false) })

const topicName = z.string().trim().min(1).max(100)
const topicPatch = z
  .object({
    monthly_budget_usd: z.number().min(0).max(10_000),
    name_fr: topicName,
    name_en: topicName,
  })
  .partial()

/** Initial setup of a new topic; everything else keeps its default and is set later. */
const newTopicBody = z.object({
  workspace_id: z.uuid(),
  name_fr: topicName,
  name_en: topicName,
  output_langs: z.array(z.enum(LANGS)).min(1),
  relevance_criteria: z.string().trim().max(4000).default(''),
  monthly_budget_usd: z.number().min(0).max(10_000).default(10),
})
const textBody = (max: number) => z.object({ text: z.string().trim().min(1).max(max) })

const DETAIL_COLUMNS =
  'item_id, topic_id, relevance_score, is_commercial, triage_reason, draft_status, draft_error, drafted_at, status, validated_at, publish_at, ' +
  'item:items (canonical_url, title, source_lang, kind, origin, published_at, discovered_at)'

const POST_COLUMNS =
  'id, channel, lang, body, status, edited_by_human, scheduled_at, sent_at, published_url, last_error, claimed_at'

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

  /** RLS: only a member of the workspace can create a topic in it. */
  .post('/', async (c) => {
    const body = await parseJson(newTopicBody, c.req.raw)
    const config = parseTopicConfig({
      output_langs: body.output_langs,
      ai: { relevance_criteria: body.relevance_criteria },
    })
    const base = slugify(body.name_en)
    // The slug is unique per workspace: "accessibility", then "accessibility-2"…
    for (let attempt = 1; attempt <= 20; attempt++) {
      const { data, error } = await c.var.db
        .from('topics')
        .insert({
          workspace_id: body.workspace_id,
          slug: attempt === 1 ? base : `${base}-${attempt}`,
          name_fr: body.name_fr,
          name_en: body.name_en,
          monthly_budget_usd: body.monthly_budget_usd,
          config,
        })
        .select(TOPIC_COLUMNS)
        .single()
      if (error?.code === '23505') continue
      if (error?.code === '42501') throw new HTTPException(403, { message: 'Not a member' })
      if (error) throw error
      return c.json(data, 201)
    }
    throw new HTTPException(409, { message: 'Topic slug already taken' })
  })

  .get('/:topicId', async (c) => {
    const { data, error } = await c.var.db
      .from('topics')
      .select(`${TOPIC_COLUMNS}, config, feed_key`)
      .eq('id', c.req.param('topicId'))
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Topic not found' })
    return c.json({ ...data, config: parseTopicConfig(data.config) })
  })

  /**
   * Public feeds of the topic: on (a new random address, or a new one replacing the
   * old when `regenerate`), or off (the address stops working).
   */
  .post('/:topicId/feed', async (c) => {
    const { enabled, regenerate } = await parseJson(feedBody, c.req.raw)
    const topicId = c.req.param('topicId')
    const { data: current, error: readError } = await c.var.db
      .from('topics')
      .select('feed_key')
      .eq('id', topicId)
      .maybeSingle()
    if (readError) throw readError
    if (!current) throw new HTTPException(404, { message: 'Topic not found' })
    const feedKey = !enabled
      ? null
      : regenerate || !current.feed_key
        ? newFeedKey()
        : current.feed_key
    const { error } = await c.var.db.from('topics').update({ feed_key: feedKey }).eq('id', topicId)
    if (error) throw error
    return c.json({ feed_key: feedKey })
  })

  .patch('/:topicId', async (c) => {
    const body = await parseJson(topicPatch, c.req.raw)
    const { data, error } = await c.var.db
      .from('topics')
      .update(body)
      .eq('id', c.req.param('topicId'))
      .select(TOPIC_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Topic not found' })
    return c.json(data)
  })

  /** Spending of the current month, by operation, against the topic budget. */
  .get('/:topicId/usage', async (c) => {
    const topicId = c.req.param('topicId')
    const [{ data: topic, error: topicError }, { data: usage, error }] = await Promise.all([
      c.var.db.from('topics').select('monthly_budget_usd').eq('id', topicId).maybeSingle(),
      c.var.db.rpc('topic_month_usage', { p_topic_id: topicId }),
    ])
    if (topicError) throw topicError
    if (error) throw error
    if (!topic) throw new HTTPException(404, { message: 'Topic not found' })
    const rows = (usage ?? []) as { operation: string; cost_usd: number | string; calls: number }[]
    const byOperation = rows.map((r) => ({
      operation: r.operation,
      cost_usd: Number(r.cost_usd),
      calls: Number(r.calls),
    }))
    return c.json({
      budget_usd: Number(topic.monthly_budget_usd),
      month_cost_usd: byOperation.reduce((sum, r) => sum + r.cost_usd, 0),
      by_operation: byOperation,
    })
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
        'item_id, topic_id, relevance_score, is_commercial, triage_reason, draft_status, draft_error, status, validated_at, publish_at, ' +
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

  /** One item with its summaries (current workspace) and post drafts. */
  .get('/:topicId/items/:itemId', async (c) => {
    const { topicId, itemId } = c.req.param()
    const { data: row, error } = await c.var.db
      .from('item_topics')
      .select(DETAIL_COLUMNS)
      .eq('topic_id', topicId)
      .eq('item_id', itemId)
      .maybeSingle()
    if (error) throw error
    if (!row) throw new HTTPException(404, { message: 'Item not found in this topic' })
    const [{ data: summaries, error: sError }, { data: posts, error: pError }] = await Promise.all([
      c.var.db
        .from('summaries')
        .select('lang, summary, key_excerpt, source_nature, edited_by_human, model, updated_at')
        .eq('item_id', itemId),
      c.var.db
        .from('posts')
        .select(POST_COLUMNS)
        .eq('item_id', itemId)
        .eq('topic_id', topicId)
        .order('channel'),
    ])
    if (sError) throw sError
    if (pError) throw pError
    return c.json({ ...(row as unknown as Record<string, unknown>), summaries, posts })
  })

  /** Queue a new drafting (validated or published items). Edited texts are kept. */
  .post('/:topicId/items/:itemId/draft', async (c) => {
    const { topicId, itemId } = c.req.param()
    const { data: queued, error } = await c.var.db.rpc('request_draft', {
      p_topic_id: topicId,
      p_item_id: itemId,
    })
    if (error?.code === '42501') throw new HTTPException(404, { message: 'Topic not found' })
    if (error) throw error
    if (!queued) throw new HTTPException(409, { message: 'Only validated items can be drafted' })
    await c.env.JOBS.send({ type: 'draft', topicId, itemId })
    return c.json({ draft_status: 'pending' }, 202)
  })

  .patch('/:topicId/items/:itemId/summaries/:lang', async (c) => {
    const { itemId, lang } = c.req.param()
    if (!(LANGS as readonly string[]).includes(lang))
      throw new HTTPException(404, { message: 'Unknown language' })
    const { text } = await parseJson(textBody(2000), c.req.raw)
    const { data, error } = await c.var.db
      .from('summaries')
      .update({ summary: text, edited_by_human: true, updated_at: new Date().toISOString() })
      .eq('item_id', itemId)
      .eq('lang', lang)
      .select('lang, summary, key_excerpt, source_nature, edited_by_human, model, updated_at')
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Summary not found' })
    return c.json(data)
  })

  /** Drafts and scheduled posts can be edited until a job starts publishing them. */
  .patch('/:topicId/posts/:postId', async (c) => {
    const { text } = await parseJson(textBody(3000), c.req.raw)
    const { data, error } = await c.var.db
      .from('posts')
      .update({ body: text, edited_by_human: true, updated_at: new Date().toISOString() })
      .eq('topic_id', c.req.param('topicId'))
      .eq('id', c.req.param('postId'))
      .in('status', ['draft', 'scheduled', 'failed'])
      .is('claimed_at', null)
      .select(POST_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Draft not found' })
    return c.json(data)
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
    // Validation queues the drafting in the database (trigger); run it now.
    if (target === 'validated') await c.env.JOBS.send({ type: 'draft', topicId, itemId })
    return c.json(data)
  })
