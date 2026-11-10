import {
  accountFor,
  nextFreeSlot,
  parseTopicConfig,
  POST_LIMITS,
  publishedLength,
  type CredentialMeta,
  type DraftChannel,
  type Lang,
} from '@pann/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { parseJson } from '../lib/validation'

const scheduleBody = z.object({ when: z.enum(['next_slot', 'now']).default('next_slot') })
const queueRange = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
})

interface PostRow {
  id: string
  channel: DraftChannel
  lang: Lang | null
  body: string
  status: string
}

/** Mounted under /topics. All reads and writes run with the user's JWT (RLS). */
export const diffusion = new Hono<AppEnv>()
  /**
   * Puts the posts of a validated item on the next free slot of the topic, or
   * publishes them now. Only posts with an account for their channel and language
   * are scheduled; a post that is too long stops everything (fix it first).
   */
  .post('/:topicId/items/:itemId/schedule', async (c) => {
    const { when } = await parseJson(scheduleBody, c.req.raw)
    const { topicId, itemId } = c.req.param()
    const db = c.var.db

    const [topicRes, itemRes, postsRes] = await Promise.all([
      db.from('topics').select('workspace_id, config').eq('id', topicId).maybeSingle(),
      db
        .from('item_topics')
        .select('publish_at, item:items (canonical_url)')
        .eq('topic_id', topicId)
        .eq('item_id', itemId)
        .maybeSingle<{ publish_at: string | null; item: { canonical_url: string } }>(),
      db
        .from('posts')
        .select('id, channel, lang, body, status')
        .eq('topic_id', topicId)
        .eq('item_id', itemId)
        .returns<PostRow[]>(),
    ])
    if (topicRes.error) throw topicRes.error
    if (itemRes.error) throw itemRes.error
    if (postsRes.error) throw postsRes.error
    if (!topicRes.data || !itemRes.data)
      throw new HTTPException(404, { message: 'Item not found in this topic' })

    const config = parseTopicConfig(topicRes.data.config)
    const url = itemRes.data.item.canonical_url
    const candidates = postsRes.data.filter(
      (p) =>
        ['draft', 'failed', 'scheduled'].includes(p.status) &&
        p.lang &&
        accountFor(config, p.channel, p.lang),
    )
    if (!candidates.length) throw new HTTPException(422, { message: 'channel_not_configured' })

    // Mastodon instances can allow longer posts than mastodon.social.
    const { data: mastodon } = await db
      .from('workspace_credentials')
      .select('meta')
      .eq('workspace_id', topicRes.data.workspace_id)
      .eq('provider', 'mastodon')
      .maybeSingle()
    const limits: Record<DraftChannel, number> = {
      ...POST_LIMITS,
      mastodon:
        (mastodon?.meta as CredentialMeta | undefined)?.max_characters ?? POST_LIMITS.mastodon,
    }
    const tooLong = candidates.find(
      (p) => publishedLength(p.channel, p.body, url) > limits[p.channel],
    )
    if (tooLong)
      throw new HTTPException(422, { message: `post_too_long:${tooLong.channel}/${tooLong.lang}` })

    const now = new Date()
    let publishAt: Date | null
    const taken: string[] = []
    if (when === 'now') {
      publishAt = now
    } else if (itemRes.data.publish_at && Date.parse(itemRes.data.publish_at) > now.getTime()) {
      publishAt = new Date(itemRes.data.publish_at) // already on the queue: keep its slot
    } else {
      const { data, error } = await db
        .from('item_topics')
        .select('publish_at')
        .eq('topic_id', topicId)
        .gte('publish_at', now.toISOString())
      if (error) throw error
      taken.push(...data.map((r) => r.publish_at as string))
      publishAt = nextFreeSlot(config.schedule, taken, now)
    }

    // Another item can take the slot meanwhile (unique index): try the next one.
    for (let attempt = 0; publishAt && attempt < 3; attempt++) {
      const { error } = await db.rpc('schedule_item', {
        p_topic_id: topicId,
        p_item_id: itemId,
        p_publish_at: publishAt.toISOString(),
        p_post_ids: candidates.map((p) => p.id),
      })
      if (!error) {
        if (when === 'now') await c.env.JOBS.send({ type: 'publish' })
        return c.json({ publish_at: publishAt.toISOString() })
      }
      if (error.code === '42501') throw new HTTPException(404, { message: 'Topic not found' })
      if (error.code === 'P0002') throw new HTTPException(409, { message: 'nothing_to_schedule' })
      if (error.code !== '23505' || when === 'now') throw error
      taken.push(publishAt.toISOString())
      publishAt = nextFreeSlot(config.schedule, taken, now)
    }
    throw new HTTPException(409, { message: publishAt ? 'slot_taken' : 'no_slot' })
  })

  /** Takes the item off the queue; its posts go back to drafts. */
  .delete('/:topicId/items/:itemId/schedule', async (c) => {
    const { topicId, itemId } = c.req.param()
    const { error } = await c.var.db.rpc('unschedule_item', {
      p_topic_id: topicId,
      p_item_id: itemId,
    })
    if (error?.code === '42501') throw new HTTPException(404, { message: 'Topic not found' })
    if (error) throw error
    return c.body(null, 204)
  })

  /** Items on the queue (upcoming slots) and the last ones published, with their posts. */
  /**
   * Items with a publication time: by default from 14 days ago onward; `from` and
   * `to` (ISO dates) narrow it to a period, the week of the planning say.
   */
  .get('/:topicId/queue', async (c) => {
    const topicId = c.req.param('topicId')
    const range = queueRange.safeParse(c.req.query())
    if (!range.success) throw new HTTPException(400, { message: z.prettifyError(range.error) })
    const since = range.data.from ?? new Date(Date.now() - 14 * 24 * 3600_000).toISOString()
    let query = c.var.db
      .from('item_topics')
      .select('item_id, status, publish_at, item:items (title, canonical_url, source_lang)')
      .eq('topic_id', topicId)
      .gte('publish_at', since)
    if (range.data.to) query = query.lt('publish_at', range.data.to)
    const { data: items, error } = await query.order('publish_at', { ascending: true }).limit(100)
    if (error) throw error
    if (!items.length) return c.json([])
    // posts has no foreign key to item_topics: read them separately.
    const { data: posts, error: postsError } = await c.var.db
      .from('posts')
      .select(
        'id, item_id, channel, lang, status, scheduled_at, sent_at, published_url, last_error',
      )
      .eq('topic_id', topicId)
      .in(
        'item_id',
        items.map((i) => i.item_id),
      )
      .neq('status', 'draft')
      .order('channel')
      .order('lang')
    if (postsError) throw postsError
    return c.json(items.map((i) => ({ ...i, posts: posts.filter((p) => p.item_id === i.item_id) })))
  })
