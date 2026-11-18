import { errorCode, parseTopicConfig } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { EXA_SEARCH_URL } from '../collect/adapters/exa'
import { extractArticleText } from '../lib/article-text'
import { fetchText } from '../lib/fetch-text'
import type { ComposeStore, CompositionRow, MediaRow, SearchOutcome } from './jobs'
import { SOURCE_CHARS } from './prompt'

export const MEDIA_BUCKET = 'composition-media'

/** Jobs only: `db` uses the secret key. */
export function supabaseComposeStore(db: SupabaseClient): ComposeStore {
  return {
    async composition(id) {
      const { data, error } = await db
        .from('compositions')
        .select(
          'id, topic_id, subject, mode, notes, link, sources, channels, draft_status, research_status, ' +
            'topic:topics!inner (workspace_id, name_en, config, monthly_budget_usd)',
        )
        .eq('id', id)
        .maybeSingle<
          Omit<CompositionRow, 'workspace_id' | 'topic'> & {
            topic: {
              workspace_id: string
              name_en: string
              config: unknown
              monthly_budget_usd: number
            }
          }
        >()
      if (error) throw error
      if (!data) return null
      return {
        ...data,
        workspace_id: data.topic.workspace_id,
        topic: {
          name_en: data.topic.name_en,
          config: parseTopicConfig(data.topic.config),
          monthly_budget_usd: Number(data.topic.monthly_budget_usd),
        },
      }
    },

    async updateComposition(id, fields) {
      const { error } = await db
        .from('compositions')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },

    async media(id) {
      const { data, error } = await db
        .from('composition_media')
        .select('id, composition_id, storage_path, mime, alt, alt_proposed, alt_status')
        .eq('id', id)
        .maybeSingle<MediaRow>()
      if (error) throw error
      return data
    },

    async updateMedia(id, fields) {
      const { error } = await db.from('composition_media').update(fields).eq('id', id)
      if (error) throw error
    },

    async mediaBytes(path) {
      const { data, error } = await db.storage.from(MEDIA_BUCKET).download(path)
      if (error) throw error
      return new Uint8Array(await data.arrayBuffer())
    },

    async saveDrafts(composition, posts) {
      const { data: existing, error } = await db
        .from('posts')
        .select('id, channel, lang, status')
        .eq('composition_id', composition.id)
      if (error) throw error
      const byKey = new Map(existing.map((p) => [`${p.channel}/${p.lang}`, p]))
      const now = new Date().toISOString()
      for (const post of posts) {
        const found = byKey.get(`${post.channel}/${post.lang}`)
        if (!found) {
          const { error: insertError } = await db.from('posts').insert({
            composition_id: composition.id,
            topic_id: composition.topic_id,
            channel: post.channel,
            lang: post.lang,
            body: post.body,
          })
          if (insertError) throw insertError
        } else if (found.status === 'draft' || found.status === 'failed') {
          // What is scheduled or sent stays as it went out.
          const { error: updateError } = await db
            .from('posts')
            .update({ body: post.body, edited_by_human: false, updated_at: now })
            .eq('id', found.id)
          if (updateError) throw updateError
        }
      }
    },

    async monthCostUsd(topicId) {
      const { data, error } = await db.rpc('topic_month_usage', { p_topic_id: topicId })
      if (error) throw error
      return ((data ?? []) as { cost_usd: number | string }[]).reduce(
        (sum, r) => sum + Number(r.cost_usd),
        0,
      )
    },

    async key(workspaceId, provider) {
      const { data, error } = await db.rpc('workspace_credentials_for_jobs', {
        p_workspace_id: workspaceId,
      })
      if (error) throw error
      return ((data ?? []) as { provider: string; secret: string }[]).find(
        (r) => r.provider === provider,
      )?.secret
    },

    async logUsage(composition, entry) {
      const { error } = await db.from('usage_log').insert({
        workspace_id: composition.workspace_id,
        topic_id: composition.topic_id,
        ...entry,
      })
      if (error) throw error
    },
  }
}

/** Text of a page given as a source (links mode). */
export async function fetchSourceText(url: string): Promise<string> {
  const page = await fetchText(url, { timeoutMs: 15_000, maxBytes: 2 * 1024 * 1024 })
  return extractArticleText(page.text, SOURCE_CHARS)
}

/** Exa search for the "search" mode: 8 results with their text (exa.ai/docs, 2026-10-01). */
export async function exaSearch(
  apiKey: string,
  query: string,
  excludeDomains: string[],
): Promise<SearchOutcome> {
  let res: Response
  try {
    res = await fetch(EXA_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        query,
        type: 'auto',
        numResults: 8,
        ...(excludeDomains.length ? { excludeDomains } : {}),
        contents: { text: { maxCharacters: SOURCE_CHARS } },
      }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return { ok: false, error: errorCode('provider_error', 'exa') }
  }
  if (res.status === 401 || res.status === 403)
    return { ok: false, error: errorCode('invalid_credential', 'exa') }
  if (res.status === 429) return { ok: false, error: errorCode('rate_limited', 'exa') }
  if (!res.ok) return { ok: false, error: errorCode('http', res.status) }
  const body = (await res.json().catch(() => null)) as {
    results?: { url?: string; title?: string | null; text?: string | null }[]
    costDollars?: { total?: number }
  } | null
  if (!body?.results) return { ok: false, error: errorCode('provider_response', 'exa') }
  return {
    ok: true,
    results: body.results
      .filter((r) => typeof r.url === 'string' && /^https?:\/\//.test(r.url))
      .map((r) => ({ url: r.url!, title: r.title?.trim() || r.url!, text: r.text ?? '' })),
    cost_usd: body.costDollars?.total ?? 0,
  }
}
