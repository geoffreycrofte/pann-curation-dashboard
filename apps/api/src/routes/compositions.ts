import {
  accountFor,
  COMPOSE_MODES,
  composeSchedule,
  DRAFT_CHANNELS,
  IMAGE_TYPES,
  MAX_ALT_LENGTH,
  MAX_COMPOSE_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_SIDE,
  missingAlt,
  nextFreeSlot,
  parseTopicConfig,
  POST_LIMITS,
  postSignature,
  publishedLength,
  type CredentialMeta,
  type DraftChannel,
  type Lang,
} from '@pann/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { MEDIA_BUCKET } from '../compose/store'
import { parseJson } from '../lib/validation'

const COMPOSITION_COLUMNS =
  'id, topic_id, subject, mode, notes, link, sources, channels, draft_status, draft_error, ' +
  'research_status, research_error, publish_at, status, created_at, updated_at'
const MEDIA_COLUMNS =
  'id, composition_id, storage_path, mime, bytes, width, height, position, alt, alt_proposed, alt_status, alt_error'
const POST_COLUMNS =
  'id, channel, lang, body, status, scheduled_at, sent_at, published_url, last_error, edited_by_human, first_comment, claimed_at'

const httpUrl = z.url({ protocol: /^https?$/ }).max(2000)
const sourceSchema = z.object({
  url: httpUrl,
  title: z.string().trim().max(300),
  excerpt: z.string().max(400).optional(),
  text: z.string().max(20_000).optional(),
  selected: z.boolean(),
})

const newComposition = z.object({
  subject: z.string().trim().max(300).default(''),
  mode: z.enum(COMPOSE_MODES).optional(),
})
const compositionPatch = z
  .object({
    subject: z.string().trim().max(300),
    mode: z.enum(COMPOSE_MODES),
    notes: z.string().max(10_000),
    link: z.union([httpUrl, z.literal('')]),
    sources: z.array(sourceSchema).max(20),
    channels: z.array(z.enum(DRAFT_CHANNELS)).max(DRAFT_CHANNELS.length),
  })
  .partial()

const newMedia = z.object({
  storage_path: z.string().max(300),
  mime: z.enum(IMAGE_TYPES),
  bytes: z.number().int().positive().max(MAX_IMAGE_BYTES),
  width: z.number().int().positive().max(MAX_IMAGE_SIDE),
  height: z.number().int().positive().max(MAX_IMAGE_SIDE),
})
const mediaPatch = z
  .object({
    alt: z.record(z.string(), z.string().trim().max(MAX_ALT_LENGTH)),
    alt_proposed: z.array(z.string()).max(10),
    position: z
      .number()
      .int()
      .min(0)
      .max(MAX_COMPOSE_IMAGES - 1),
  })
  .partial()

const scheduleBody = z.object({ when: z.enum(['next_slot', 'now']).default('next_slot') })

/** Signed addresses to show the images (one hour), read with the user's rights. */
async function withPreviews<T extends { storage_path: string }>(
  db: AppEnv['Variables']['db'],
  media: T[],
): Promise<(T & { preview_url: string | null })[]> {
  if (!media.length) return []
  const { data } = await db.storage.from(MEDIA_BUCKET).createSignedUrls(
    media.map((m) => m.storage_path),
    3600,
  )
  const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]))
  return media.map((m) => ({ ...m, preview_url: urls.get(m.storage_path) ?? null }))
}

/**
 * Création tool, mounted under /topics. Every read and write runs with the user's JWT
 * (RLS); the jobs (drafting, search, text alternatives) are asked through functions that
 * check the access first, then queued.
 */
export const compositions = new Hono<AppEnv>()
  .get('/:topicId/compositions', async (c) => {
    const { data, error } = await c.var.db
      .from('compositions')
      .select('id, subject, mode, status, publish_at, draft_status, created_at, updated_at')
      .eq('topic_id', c.req.param('topicId'))
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    return c.json(data)
  })

  .post('/:topicId/compositions', async (c) => {
    const body = await parseJson(newComposition, c.req.raw)
    const topicId = c.req.param('topicId')
    const { data: topic, error: topicError } = await c.var.db
      .from('topics')
      .select('config')
      .eq('id', topicId)
      .maybeSingle()
    if (topicError) throw topicError
    if (!topic) throw new HTTPException(404, { message: 'Topic not found' })
    const config = parseTopicConfig(topic.config)
    const { data, error } = await c.var.db
      .from('compositions')
      .insert({ topic_id: topicId, subject: body.subject, mode: body.mode ?? config.compose.mode })
      .select(COMPOSITION_COLUMNS)
      .single()
    if (error) throw error
    return c.json(data, 201)
  })

  .get('/:topicId/compositions/:id', async (c) => {
    const { topicId, id } = c.req.param()
    const db = c.var.db
    const [composition, media, posts] = await Promise.all([
      db
        .from('compositions')
        .select(COMPOSITION_COLUMNS)
        .eq('topic_id', topicId)
        .eq('id', id)
        .maybeSingle<Record<string, unknown>>(),
      db
        .from('composition_media')
        .select(MEDIA_COLUMNS)
        .eq('composition_id', id)
        .order('position')
        .order('created_at')
        .returns<{ storage_path: string }[]>(),
      db.from('posts').select(POST_COLUMNS).eq('composition_id', id).order('channel').order('lang'),
    ])
    if (composition.error) throw composition.error
    if (media.error) throw media.error
    if (posts.error) throw posts.error
    if (!composition.data) throw new HTTPException(404, { message: 'Composition not found' })
    return c.json({
      ...composition.data,
      media: await withPreviews(db, media.data),
      posts: posts.data,
    })
  })

  .patch('/:topicId/compositions/:id', async (c) => {
    const body = await parseJson(compositionPatch, c.req.raw)
    const { topicId, id } = c.req.param()
    const { data, error } = await c.var.db
      .from('compositions')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('topic_id', topicId)
      .eq('id', id)
      .select(COMPOSITION_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Composition not found' })
    return c.json(data)
  })

  /** A draft only (RLS); its images leave the storage too. */
  .delete('/:topicId/compositions/:id', async (c) => {
    const { topicId, id } = c.req.param()
    const db = c.var.db
    const { data: media, error: mediaError } = await db
      .from('composition_media')
      .select('storage_path')
      .eq('composition_id', id)
    if (mediaError) throw mediaError
    const { data, error } = await db
      .from('compositions')
      .delete()
      .eq('topic_id', topicId)
      .eq('id', id)
      .select('id')
    if (error) throw error
    if (!data.length) throw new HTTPException(409, { message: 'Only a draft can be deleted' })
    if (media.length)
      await db.storage.from(MEDIA_BUCKET).remove(media.map((m) => m.storage_path as string))
    return c.body(null, 204)
  })

  /** Search (mode "search") and drafting run as jobs; the board polls the composition. */
  .post('/:topicId/compositions/:id/research', async (c) => {
    const id = c.req.param('id')
    const { data, error } = await c.var.db.rpc('request_compose_job', {
      p_composition_id: id,
      p_job: 'research',
    })
    if (error?.code === '42501') throw new HTTPException(404, { message: 'Composition not found' })
    if (error) throw error
    if (data) await c.env.JOBS.send({ type: 'compose-research', compositionId: id })
    return c.json({ queued: data === true }, 202)
  })

  .post('/:topicId/compositions/:id/draft', async (c) => {
    const id = c.req.param('id')
    const { data, error } = await c.var.db.rpc('request_compose_job', {
      p_composition_id: id,
      p_job: 'draft',
    })
    if (error?.code === '42501') throw new HTTPException(404, { message: 'Composition not found' })
    if (error) throw error
    if (data) await c.env.JOBS.send({ type: 'compose-draft', compositionId: id })
    return c.json({ queued: data === true }, 202)
  })

  /**
   * An image the board uploaded to the storage (resized and compressed first). It is
   * recorded, then its text alternatives are proposed by a job.
   */
  .post('/:topicId/compositions/:id/media', async (c) => {
    const body = await parseJson(newMedia, c.req.raw)
    const { topicId, id } = c.req.param()
    if (!body.storage_path.startsWith(`${topicId}/${id}/`) || body.storage_path.includes('..'))
      throw new HTTPException(400, { message: 'Invalid storage path' })
    const { count, error: countError } = await c.var.db
      .from('composition_media')
      .select('id', { count: 'exact', head: true })
      .eq('composition_id', id)
    if (countError) throw countError
    const { data, error } = await c.var.db
      .from('composition_media')
      .insert({ ...body, composition_id: id, topic_id: topicId, position: count ?? 0 })
      .select(MEDIA_COLUMNS)
      .single<{ id: string; storage_path: string }>()
    if (error?.code === '22023') throw new HTTPException(409, { message: 'too_many_images' })
    if (error) throw error
    const { data: queued, error: rpcError } = await c.var.db.rpc('request_media_alt', {
      p_media_id: data.id,
    })
    if (rpcError) throw rpcError
    if (queued) await c.env.JOBS.send({ type: 'describe-media', mediaId: data.id })
    const [withPreview] = await withPreviews(c.var.db, [data])
    return c.json({ ...withPreview, alt_status: queued ? 'pending' : 'idle' }, 201)
  })

  .patch('/:topicId/compositions/:id/media/:mediaId', async (c) => {
    const body = await parseJson(mediaPatch, c.req.raw)
    const { id, mediaId } = c.req.param()
    const { data, error } = await c.var.db
      .from('composition_media')
      .update(body)
      .eq('composition_id', id)
      .eq('id', mediaId)
      .select(MEDIA_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Image not found' })
    return c.json(data)
  })

  /** Proposes the text alternatives again, for the languages still empty. */
  .post('/:topicId/compositions/:id/media/:mediaId/describe', async (c) => {
    const mediaId = c.req.param('mediaId')
    const { data, error } = await c.var.db.rpc('request_media_alt', { p_media_id: mediaId })
    if (error?.code === '42501') throw new HTTPException(404, { message: 'Image not found' })
    if (error) throw error
    if (data) await c.env.JOBS.send({ type: 'describe-media', mediaId })
    return c.json({ queued: data === true }, 202)
  })

  .delete('/:topicId/compositions/:id/media/:mediaId', async (c) => {
    const { id, mediaId } = c.req.param()
    const { data, error } = await c.var.db
      .from('composition_media')
      .delete()
      .eq('composition_id', id)
      .eq('id', mediaId)
      .select('storage_path')
    if (error) throw error
    if (!data.length) throw new HTTPException(404, { message: 'Image not found' })
    await c.var.db.storage.from(MEDIA_BUCKET).remove([data[0]!.storage_path as string])
    return c.body(null, 204)
  })

  /**
   * Puts the posts of a composition on the next free Création slot, or publishes them
   * now. Same checks as the news watch (an account is set, the length fits), plus the
   * text alternative of every image in the language of each post.
   */
  .post('/:topicId/compositions/:id/schedule', async (c) => {
    const { when } = await parseJson(scheduleBody, c.req.raw)
    const { topicId, id } = c.req.param()
    const db = c.var.db
    const [topicRes, compRes, postsRes, mediaRes] = await Promise.all([
      db.from('topics').select('workspace_id, config').eq('id', topicId).maybeSingle(),
      db
        .from('compositions')
        .select('publish_at, link')
        .eq('topic_id', topicId)
        .eq('id', id)
        .maybeSingle<{ publish_at: string | null; link: string }>(),
      db
        .from('posts')
        .select('id, channel, lang, body, status')
        .eq('composition_id', id)
        .returns<
          { id: string; channel: DraftChannel; lang: Lang | null; body: string; status: string }[]
        >(),
      db.from('composition_media').select('alt').eq('composition_id', id),
    ])
    for (const res of [topicRes, compRes, postsRes, mediaRes]) if (res.error) throw res.error
    if (!topicRes.data || !compRes.data)
      throw new HTTPException(404, { message: 'Composition not found' })

    const config = parseTopicConfig(topicRes.data.config)
    const candidates = (postsRes.data ?? []).filter(
      (p) =>
        ['draft', 'failed', 'scheduled'].includes(p.status) &&
        p.lang &&
        accountFor(config, p.channel, p.lang),
    )
    if (!candidates.length) throw new HTTPException(422, { message: 'channel_not_configured' })

    const media = (mediaRes.data ?? []) as { alt: Record<string, string> }[]
    const langs = [...new Set(candidates.map((p) => p.lang!))]
    const missing = missingAlt(media, langs)
    if (missing.length) throw new HTTPException(422, { message: `alt_missing:${missing[0]}` })

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
    const link = compRes.data.link
    const tooLong = candidates.find(
      (p) =>
        publishedLength(p.channel, p.body, link, postSignature(config, p.channel, p.lang!)) >
        limits[p.channel],
    )
    if (tooLong)
      throw new HTTPException(422, { message: `post_too_long:${tooLong.channel}/${tooLong.lang}` })

    const schedule = composeSchedule(config)
    const now = new Date()
    let publishAt: Date | null
    const taken: string[] = []
    if (when === 'now') {
      publishAt = now
    } else if (compRes.data.publish_at && Date.parse(compRes.data.publish_at) > now.getTime()) {
      publishAt = new Date(compRes.data.publish_at)
    } else {
      const { data, error } = await db
        .from('compositions')
        .select('publish_at')
        .eq('topic_id', topicId)
        .gte('publish_at', now.toISOString())
      if (error) throw error
      taken.push(...data.map((r) => r.publish_at as string))
      publishAt = nextFreeSlot(schedule, taken, now)
    }

    for (let attempt = 0; publishAt && attempt < 3; attempt++) {
      const { error } = await db.rpc('schedule_composition', {
        p_topic_id: topicId,
        p_composition_id: id,
        p_publish_at: publishAt.toISOString(),
        p_post_ids: candidates.map((p) => p.id),
      })
      if (!error) {
        if (when === 'now') await c.env.JOBS.send({ type: 'publish' })
        return c.json({ publish_at: publishAt.toISOString() })
      }
      if (error.code === '42501') throw new HTTPException(404, { message: 'Composition not found' })
      if (error.code === 'P0002') throw new HTTPException(409, { message: 'nothing_to_schedule' })
      if (error.code !== '23505' || when === 'now') throw error
      taken.push(publishAt.toISOString())
      publishAt = nextFreeSlot(schedule, taken, now)
    }
    throw new HTTPException(409, { message: publishAt ? 'slot_taken' : 'no_slot' })
  })

  .delete('/:topicId/compositions/:id/schedule', async (c) => {
    const { topicId, id } = c.req.param()
    const { error } = await c.var.db.rpc('unschedule_composition', {
      p_topic_id: topicId,
      p_composition_id: id,
    })
    if (error?.code === '42501') throw new HTTPException(404, { message: 'Topic not found' })
    if (error) throw error
    return c.body(null, 204)
  })
