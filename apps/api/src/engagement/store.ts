import { parseTopicConfig, type ConversationMeta } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseTriageStore } from '../triage/store'
import { MAX_ENGAGEMENT_ATTEMPTS, type EngagementStore } from './triage'

interface PendingRow {
  item_id: string
  topic_id: string
  triage_attempts: number
  item: {
    title: string
    canonical_url: string
    published_at: string | null
    fetched_content: string | null
    source_lang: string | null
    meta: ConversationMeta | null
  }
  topic: { workspace_id: string; name_en: string; config: unknown }
}

/** Supabase implementation. `db` must use the secret key (jobs only). */
export function supabaseEngagementStore(db: SupabaseClient): EngagementStore {
  // Key, usage and failures are stored as for the curation triage.
  const shared = supabaseTriageStore(db)
  return {
    async pending({ limit, topicId }) {
      let query = db
        .from('item_topics')
        .select(
          'item_id, topic_id, triage_attempts, ' +
            'item:items!inner (title, canonical_url, published_at, fetched_content, source_lang, meta), ' +
            'topic:topics!inner (workspace_id, name_en, config, active)',
        )
        .eq('module', 'engagement')
        .is('relevance_score', null)
        .eq('status', 'new')
        .lt('triage_attempts', MAX_ENGAGEMENT_ATTEMPTS)
        .eq('topic.active', true)
        .order('created_at')
        .limit(limit)
      if (topicId) query = query.eq('topic_id', topicId)
      const { data, error } = await query.returns<PendingRow[]>()
      if (error) throw error
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
        source_lang: row.item.source_lang,
        meta: row.item.meta ?? {},
      }))
    },

    anthropicKey: shared.anthropicKey,
    markCredentialInvalid: shared.markCredentialInvalid,

    async saveDecision(item, decision) {
      const { error } = await db
        .from('item_topics')
        .update({
          relevance_score: decision.opportunity,
          triage_reason: decision.reason,
          engagement_decision: decision.decision,
          engagement_angle: decision.angle,
          engagement_risk: decision.risk,
          triaged_at: new Date().toISOString(),
          triage_error: null,
          status: decision.archived ? 'archived' : 'new',
        })
        .eq('item_id', item.item_id)
        .eq('topic_id', item.topic_id)
        .eq('status', 'new') // the user may have moved it meanwhile
      if (error) throw error
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
