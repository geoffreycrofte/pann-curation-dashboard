import { parseTopicConfig } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { extractArticleText } from '../lib/article-text'
import { fetchText } from '../lib/fetch-text'
import { MAX_DRAFT_ATTEMPTS, type DraftStore, type PendingDraft } from './draft'

interface PendingRow {
  item_id: string
  topic_id: string
  draft_attempts: number
  item: {
    title: string
    canonical_url: string
    published_at: string | null
    source_lang: string | null
    fetched_content: string | null
  }
  topic: { workspace_id: string; name_en: string; config: unknown; monthly_budget_usd: number }
}

/** Supabase implementation. `db` must use the secret key (jobs only). */
export function supabaseDraftStore(db: SupabaseClient): DraftStore {
  return {
    async pending({ limit, topicId, itemId }) {
      let query = db
        .from('item_topics')
        .select(
          'item_id, topic_id, draft_attempts, ' +
            'item:items!inner (title, canonical_url, published_at, source_lang, fetched_content), ' +
            'topic:topics!inner (workspace_id, name_en, config, monthly_budget_usd)',
        )
        .eq('draft_status', 'pending')
        .lt('draft_attempts', MAX_DRAFT_ATTEMPTS)
        .order('validated_at', { ascending: true, nullsFirst: false })
        .limit(limit)
      if (topicId) query = query.eq('topic_id', topicId)
      if (itemId) query = query.eq('item_id', itemId)
      const { data, error } = await query.returns<PendingRow[]>()
      if (error) throw error
      return data.map((row) => ({
        item_id: row.item_id,
        topic_id: row.topic_id,
        workspace_id: row.topic.workspace_id,
        topic_name_en: row.topic.name_en,
        topic_config: parseTopicConfig(row.topic.config),
        monthly_budget_usd: Number(row.topic.monthly_budget_usd),
        draft_attempts: row.draft_attempts,
        ...row.item,
      }))
    },

    async anthropicKey(workspaceId) {
      const { data, error } = await db.rpc('workspace_credentials_for_jobs', {
        p_workspace_id: workspaceId,
      })
      if (error) throw error
      return ((data ?? []) as { provider: string; secret: string }[]).find(
        (r) => r.provider === 'anthropic',
      )?.secret
    },

    async markCredentialInvalid(workspaceId) {
      const { error } = await db
        .from('workspace_credentials')
        .update({
          status: 'invalid',
          status_detail: 'rejected_during_collection',
          checked_at: new Date().toISOString(),
        })
        .eq('workspace_id', workspaceId)
        .eq('provider', 'anthropic')
      if (error) throw error
    },

    async monthCostUsd(topicId) {
      const { data, error } = await db.rpc('topic_month_usage', { p_topic_id: topicId })
      if (error) throw error
      return ((data ?? []) as { cost_usd: number | string }[]).reduce(
        (sum, r) => sum + Number(r.cost_usd),
        0,
      )
    },

    async fetchContent(item) {
      try {
        const page = await fetchText(item.canonical_url, {
          timeoutMs: 15_000,
          maxBytes: 2 * 1024 * 1024,
        })
        const text = extractArticleText(page.text)
        if (text.length > (item.fetched_content?.length ?? 0)) {
          await db.from('items').update({ fetched_content: text }).eq('id', item.item_id)
        }
        return text
      } catch {
        return null
      }
    },

    async saveDraft(item, draft) {
      // Summaries: one per workspace and language; a summary edited by a person is kept.
      const { data: edited, error: readError } = await db
        .from('summaries')
        .select('lang')
        .eq('workspace_id', item.workspace_id)
        .eq('item_id', item.item_id)
        .eq('edited_by_human', true)
      if (readError) throw readError
      const keep = new Set((edited ?? []).map((s) => s.lang))
      const summaries = draft.summaries
        .filter((s) => !keep.has(s.lang))
        .map((s) => ({
          workspace_id: item.workspace_id,
          item_id: item.item_id,
          lang: s.lang,
          summary: s.summary,
          key_excerpt: draft.key_excerpt,
          source_nature: draft.source_nature,
          model: draft.model,
          prompt_version: draft.prompt_version,
          edited_by_human: false,
          updated_at: new Date().toISOString(),
        }))
      if (summaries.length) {
        const { error } = await db
          .from('summaries')
          .upsert(summaries, { onConflict: 'workspace_id,item_id,lang' })
        if (error) throw error
      }

      // Posts: replace the drafts nobody edited; keep edited ones and anything scheduled or sent.
      const { data: existing, error: postsError } = await db
        .from('posts')
        .select('id, channel, lang, status, edited_by_human')
        .eq('item_id', item.item_id)
        .eq('topic_id', item.topic_id)
      if (postsError) throw postsError
      const replaceable = (existing ?? []).filter((p) => p.status === 'draft' && !p.edited_by_human)
      const kept = new Set(
        (existing ?? [])
          .filter((p) => !replaceable.includes(p))
          .map((p) => `${p.channel}/${p.lang}`),
      )
      if (replaceable.length) {
        const { error } = await db
          .from('posts')
          .delete()
          .in(
            'id',
            replaceable.map((p) => p.id),
          )
        if (error) throw error
      }
      const posts = draft.posts
        .filter((p) => !kept.has(`${p.channel}/${p.lang}`))
        .map((p) => ({
          item_id: item.item_id,
          topic_id: item.topic_id,
          channel: p.channel,
          lang: p.lang,
          body: p.body,
        }))
      if (posts.length) {
        const { error } = await db.from('posts').insert(posts)
        if (error) throw error
      }

      const { error } = await db
        .from('item_topics')
        .update({ draft_status: 'ready', draft_error: null, drafted_at: new Date().toISOString() })
        .eq('item_id', item.item_id)
        .eq('topic_id', item.topic_id)
      if (error) throw error
    },

    async saveFailure(item, draftError, final) {
      const { error } = await db
        .from('item_topics')
        .update({
          draft_error: draftError,
          draft_attempts: item.draft_attempts + 1,
          ...(final ? { draft_status: 'failed' } : {}),
        })
        .eq('item_id', item.item_id)
        .eq('topic_id', item.topic_id)
      if (error) throw error
    },

    async logUsage(item, usage) {
      const { error } = await db.from('usage_log').insert({
        workspace_id: item.workspace_id,
        topic_id: item.topic_id,
        provider: usage.provider,
        model: usage.model ?? null,
        operation: usage.operation,
        units: usage.units,
        cost_usd: usage.cost_usd,
      })
      if (error) throw error
    },
  }
}
