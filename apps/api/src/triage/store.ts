import { parseTopicConfig } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TRIAGE_RECENT_ITEMS } from './prompt'
import { MAX_TRIAGE_ATTEMPTS, type PendingTriage, type TriageStore } from './triage'

/** How far back an item counts as recent, to spot the same story told twice. */
const RECENT_DAYS = 14

interface PendingRow {
  item_id: string
  topic_id: string
  triage_attempts: number
  kind: string | null
  item: {
    title: string
    canonical_url: string
    published_at: string | null
    fetched_content: string | null
    source_lang: string | null
  }
  topic: { workspace_id: string; name_en: string; config: unknown; active: boolean }
}

/** Supabase implementation. `db` must use the secret key (jobs only). */
export function supabaseTriageStore(db: SupabaseClient): TriageStore {
  return {
    async pending({ limit, topicId }) {
      let query = db
        .from('item_topics')
        .select(
          'item_id, topic_id, triage_attempts, kind, ' +
            'item:items!inner (title, canonical_url, published_at, fetched_content, source_lang), ' +
            'topic:topics!inner (workspace_id, name_en, config, active)',
        )
        .is('relevance_score', null)
        .eq('status', 'new')
        // Conversations have their own triage (engagement/triage.ts).
        .eq('module', 'curation')
        .lt('triage_attempts', MAX_TRIAGE_ATTEMPTS)
        .eq('topic.active', true)
        .order('created_at')
        .limit(limit)
      if (topicId) query = query.eq('topic_id', topicId)
      const { data, error } = await query.returns<PendingRow[]>()
      if (error) throw error

      // Per topic, the items already triaged lately: one query per topic, not per item.
      const recent = new Map<string, { item_id: string; title: string }[]>()
      const since = new Date(Date.now() - RECENT_DAYS * 86400 * 1000).toISOString()
      for (const id of new Set(data.map((row) => row.topic_id))) {
        const { data: rows, error: recentError } = await db
          .from('item_topics')
          .select('item_id, item:items!inner (title)')
          .eq('topic_id', id)
          .eq('module', 'curation')
          .neq('status', 'archived')
          .not('relevance_score', 'is', null)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(TRIAGE_RECENT_ITEMS)
          .returns<{ item_id: string; item: { title: string } }[]>()
        if (recentError) throw recentError
        recent.set(
          id,
          rows.map((r) => ({ item_id: r.item_id, title: r.item.title })),
        )
      }

      return data.map((row) => ({
        item_id: row.item_id,
        topic_id: row.topic_id,
        workspace_id: row.topic.workspace_id,
        topic_name_en: row.topic.name_en,
        topic_config: parseTopicConfig(row.topic.config),
        triage_attempts: row.triage_attempts,
        title: row.item.title,
        canonical_url: row.item.canonical_url,
        published_at: row.item.published_at,
        fetched_content: row.item.fetched_content,
        item_kind: row.kind,
        source_lang: row.item.source_lang,
        recent: (recent.get(row.topic_id) ?? []).filter((r) => r.item_id !== row.item_id),
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

    async saveDecision(item, decision) {
      const { error } = await db
        .from('item_topics')
        .update({
          relevance_score: decision.relevance,
          is_commercial: decision.commercial,
          triage_reason: decision.reason,
          triaged_at: new Date().toISOString(),
          triage_error: null,
          same_story_of: decision.same_story_of,
          status: decision.archived ? 'archived' : 'new',
          // The kind given by the source or the user wins over the triage.
          ...(!item.item_kind && decision.kind ? { kind: decision.kind } : {}),
        })
        .eq('item_id', item.item_id)
        .eq('topic_id', item.topic_id)
        .eq('status', 'new') // the user may have moved it meanwhile
      if (error) throw error
      // "on_display" mode: draft every item kept in the board, before any decision.
      if (!decision.archived && item.topic_config.ai.draft_mode === 'on_display') {
        const { error: queueError } = await db
          .from('item_topics')
          .update({ draft_status: 'pending' })
          .eq('item_id', item.item_id)
          .eq('topic_id', item.topic_id)
          .eq('draft_status', 'none')
        if (queueError) throw queueError
      }
      // Item-level fact: only fill what the collector did not know.
      if (!item.source_lang && decision.language) {
        const { error: itemError } = await db
          .from('items')
          .update({ source_lang: decision.language })
          .eq('id', item.item_id)
        if (itemError) throw itemError
      }
    },

    async saveFailure(item, triageError) {
      const { error } = await db
        .from('item_topics')
        .update({ triage_attempts: item.triage_attempts + 1, triage_error: triageError })
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
