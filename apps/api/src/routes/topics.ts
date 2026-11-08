import {
  canTransition,
  domainSchema,
  isExcludedUrl,
  LANGS,
  extractPageTitle,
  newFeedKey,
  ITEM_TOPIC_STATUSES,
  normalizeUrl,
  parseTopicConfig,
  slugify,
  safeParseTopicConfig,
  kindSchema,
  topicConfigSchema,
  type ItemTopicStatus,
} from '@pann/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { fetchText } from '../lib/fetch-text'
import { checkKind, kindKey } from '../lib/kinds'
import { rewriteRequestSchema } from '../rewrite/prompt'
import { parseJson } from '../lib/validation'

const TOPIC_COLUMNS = 'id, workspace_id, slug, name_fr, name_en, active, monthly_budget_usd'

const listQuery = z.object({
  status: z.enum(ITEM_TOPIC_STATUSES).default('new'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

/** Status and/or kind of an item in a topic. */
const itemPatch = z
  .object({ status: z.enum(ITEM_TOPIC_STATUSES), kind: kindKey.nullable() })
  .partial()
  .refine((body) => body.status !== undefined || body.kind !== undefined, {
    message: 'Nothing to change',
  })

/**
 * New list of the topic kinds. A removed kind is replaced, on the items and sources
 * that use it, by the kind given in `replacements` (null: no kind).
 */
const kindsBody = z.object({
  kinds: z.array(kindSchema).min(1).max(20),
  replacements: z.record(z.string(), kindKey.nullable()).default({}),
})

/** Top-level keys of the topic config are replaced as a whole, then the result is validated. */
const configPatch = z.record(z.string(), z.unknown())

/** Excluding a site, optionally from an item of the board ("Reject" > "Exclude this site"). */
const excludeBody = z.object({ domain: domainSchema, item_id: z.uuid().optional() })

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
  'item_id, topic_id, relevance_score, is_commercial, triage_reason, draft_status, draft_error, drafted_at, status, validated_at, publish_at, kind, ' +
  'item:items (canonical_url, title, source_lang, origin, published_at, discovered_at)'

const POST_COLUMNS =
  'id, channel, lang, body, status, edited_by_human, scheduled_at, sent_at, published_url, last_error, claimed_at'

const manualItemBody = z.object({
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().trim().max(500).optional(),
  kind: kindKey.nullable().default(null),
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
    // Removing a kind reassigns items and sources: PUT /kinds does it.
    if ('kinds' in patch) throw new HTTPException(400, { message: 'invalid_config' })
    const topicId = c.req.param('topicId')
    const { data: current, error: readError } = await c.var.db
      .from('topics')
      .select('config')
      .eq('id', topicId)
      .maybeSingle()
    if (readError) throw readError
    if (!current) throw new HTTPException(404, { message: 'Topic not found' })

    const next = safeParseTopicConfig({ ...(current.config as object), ...patch })
    if (!next.success) throw new HTTPException(400, { message: z.prettifyError(next.error) })

    const { error } = await c.var.db.from('topics').update({ config: next.data }).eq('id', topicId)
    if (error) throw error
    return c.json(next.data)
  })

  .put('/:topicId/kinds', async (c) => {
    const { kinds, replacements } = await parseJson(kindsBody, c.req.raw)
    const topicId = c.req.param('topicId')
    const { data: current, error: readError } = await c.var.db
      .from('topics')
      .select('config')
      .eq('id', topicId)
      .maybeSingle()
    if (readError) throw readError
    if (!current) throw new HTTPException(404, { message: 'Topic not found' })

    const config = parseTopicConfig(current.config)
    const keys = new Set(kinds.map((k) => k.key))
    const removed = config.kinds.map((k) => k.key).filter((key) => !keys.has(key))
    for (const key of removed) {
      const target = replacements[key] ?? null
      if (target !== null && !keys.has(target))
        throw new HTTPException(400, { message: 'invalid_config' })
    }
    const next = topicConfigSchema.safeParse({
      ...config,
      kinds,
      collection: {
        ...config.collection,
        intervals_hours: Object.fromEntries(
          Object.entries(config.collection.intervals_hours).filter(([key]) => keys.has(key)),
        ),
      },
    })
    if (!next.success) throw new HTTPException(400, { message: z.prettifyError(next.error) })

    // Reassign first: a failure leaves the old list, still matching the data.
    for (const key of removed) {
      const target = replacements[key] ?? null
      const [items, sources] = await Promise.all([
        c.var.db
          .from('item_topics')
          .update({ kind: target })
          .eq('topic_id', topicId)
          .eq('kind', key),
        c.var.db
          .from('sources')
          .update({ default_kind: target })
          .eq('topic_id', topicId)
          .eq('default_kind', key),
      ])
      if (items.error) throw items.error
      if (sources.error) throw sources.error
    }
    const { error } = await c.var.db.from('topics').update({ config: next.data }).eq('id', topicId)
    if (error) throw error
    return c.json(next.data)
  })

  /**
   * Adds a site to the topic exclusions. The item it comes from, if any, and every item
   * of that site still waiting in "To sort" are rejected: the site is never cited.
   */
  .post('/:topicId/excluded-domains', async (c) => {
    const { domain, item_id } = await parseJson(excludeBody, c.req.raw)
    const topicId = c.req.param('topicId')
    const { data: topic, error: readError } = await c.var.db
      .from('topics')
      .select('config')
      .eq('id', topicId)
      .maybeSingle()
    if (readError) throw readError
    if (!topic) throw new HTTPException(404, { message: 'Topic not found' })

    const config = parseTopicConfig(topic.config)
    const excluded = config.collection.excluded_domains
    if (!excluded.includes(domain)) {
      const next = topicConfigSchema.safeParse({
        ...config,
        collection: { ...config.collection, excluded_domains: [...excluded, domain].sort() },
      })
      if (!next.success) throw new HTTPException(400, { message: z.prettifyError(next.error) })
      const { error } = await c.var.db
        .from('topics')
        .update({ config: next.data })
        .eq('id', topicId)
      if (error) throw error
    }

    const { data: rows, error: listError } = await c.var.db
      .from('item_topics')
      .select('item_id, status, item:items (canonical_url)')
      .eq('topic_id', topicId)
      .in('status', ['new', 'archived', 'validated'])
      .returns<{ item_id: string; status: ItemTopicStatus; item: { canonical_url: string } }[]>()
    if (listError) throw listError
    // The chosen item, whatever its status; the others only while they wait in "To sort".
    const toReject = (rows ?? [])
      .filter((r) =>
        r.item_id === item_id ? canTransition(r.status, 'rejected') : r.status === 'new',
      )
      .filter((r) => r.item_id === item_id || isExcludedUrl(r.item.canonical_url, [domain]))
      .map((r) => r.item_id)
    if (toReject.length) {
      const { error } = await c.var.db
        .from('item_topics')
        .update({ status: 'rejected' })
        .eq('topic_id', topicId)
        .in('item_id', toReject)
      if (error) throw error
    }
    return c.json({ domain, rejected: toReject.length })
  })

  .delete('/:topicId/excluded-domains/:domain', async (c) => {
    const { topicId, domain } = c.req.param()
    const { data: topic, error: readError } = await c.var.db
      .from('topics')
      .select('config')
      .eq('id', topicId)
      .maybeSingle()
    if (readError) throw readError
    if (!topic) throw new HTTPException(404, { message: 'Topic not found' })
    const config = parseTopicConfig(topic.config)
    const next = {
      ...config,
      collection: {
        ...config.collection,
        excluded_domains: config.collection.excluded_domains.filter((d) => d !== domain),
      },
    }
    const { error } = await c.var.db.from('topics').update({ config: next }).eq('id', topicId)
    if (error) throw error
    return c.body(null, 204)
  })

  /** Number of items per status, for the board tabs (archived items are not counted). */
  .get('/:topicId/counts', async (c) => {
    const topicId = c.req.param('topicId')
    const statuses = ITEM_TOPIC_STATUSES.filter((s) => s !== 'archived')
    const results = await Promise.all(
      statuses.map((status) =>
        c.var.db
          .from('item_topics')
          .select('item_id', { count: 'exact', head: true })
          .eq('topic_id', topicId)
          .eq('status', status),
      ),
    )
    const counts: Partial<Record<ItemTopicStatus, number>> = {}
    results.forEach(({ count, error }, index) => {
      if (error) throw error
      counts[statuses[index]!] = count ?? 0
    })
    return c.json(counts)
  })

  /**
   * AI rewrite of a summary or a post. The request is recorded (RLS: the user can
   * access the topic and the item is in it), a job runs it; the board polls the result.
   */
  .post('/:topicId/items/:itemId/rewrites', async (c) => {
    const request = await parseJson(rewriteRequestSchema, c.req.raw)
    const { topicId, itemId } = c.req.param()
    const { data: link, error: linkError } = await c.var.db
      .from('item_topics')
      .select('item_id')
      .eq('topic_id', topicId)
      .eq('item_id', itemId)
      .maybeSingle()
    if (linkError) throw linkError
    if (!link) throw new HTTPException(404, { message: 'Item not found in this topic' })
    const { data, error } = await c.var.db
      .from('rewrites')
      .insert({ topic_id: topicId, item_id: itemId, request })
      .select('id')
      .single()
    if (error) throw error
    await c.env.JOBS.send({ type: 'rewrite', rewriteId: data.id })
    return c.json({ id: data.id }, 202)
  })

  .get('/:topicId/rewrites/:rewriteId', async (c) => {
    const { data, error } = await c.var.db
      .from('rewrites')
      .select('id, status, result, error')
      .eq('topic_id', c.req.param('topicId'))
      .eq('id', c.req.param('rewriteId'))
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Rewrite not found' })
    return c.json(data)
  })

  .get('/:topicId/items', async (c) => {
    const query = listQuery.safeParse(c.req.query())
    if (!query.success) throw new HTTPException(400, { message: z.prettifyError(query.error) })
    const { status, limit, offset } = query.data

    const { data, error } = await c.var.db
      .from('item_topics')
      .select(
        'item_id, topic_id, relevance_score, is_commercial, triage_reason, draft_status, draft_error, status, validated_at, publish_at, kind, ' +
          'item:items (canonical_url, title, source_lang, origin, published_at, discovered_at)',
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
    await checkKind(c.var.db, c.req.param('topicId'), body.kind)
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
        .eq('item_id', itemId)
        .order('lang'),
      c.var.db
        .from('posts')
        .select(POST_COLUMNS)
        .eq('item_id', itemId)
        .eq('topic_id', topicId)
        // Stable order: an update must not move a post (rows come back in any order).
        .order('channel')
        .order('lang'),
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
    const body = await parseJson(itemPatch, c.req.raw)
    const { topicId, itemId } = c.req.param()

    if (body.kind !== undefined) {
      await checkKind(c.var.db, topicId, body.kind)
      const { data, error } = await c.var.db
        .from('item_topics')
        .update({ kind: body.kind })
        .eq('topic_id', topicId)
        .eq('item_id', itemId)
        .select('item_id, topic_id, status, validated_at, kind')
        .maybeSingle()
      if (error) throw error
      if (!data) throw new HTTPException(404, { message: 'Item not found in this topic' })
      if (body.status === undefined) return c.json(data)
    }
    const target = body.status!

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
