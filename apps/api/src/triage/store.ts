import { parseTopicConfig } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MAX_TRIAGE_ATTEMPTS, type PendingTriage, type TriageStore } from './triage'

interface PendingRow {
  item_id: string
  topic_id: string
  triage_attempts: number
  item: {
    title: string
    canonical_url: string
    published_at: string | null
    fetched_content: string | null
    kind: PendingTriage['item_kind']
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
          'item_id, topic_id, triage_attempts, ' +
            'item:items!inner (title, canonical_url, published_at, fetched_content, kind, source_lang), ' +
            'topic:topics!inner (workspace_id, name_en, config, active)',
        )
        .is('relevance_score', null)
        .eq('status', 'new')
        .lt('triage_attempts', MAX_TRIAGE_ATTEMPTS)
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
        item_kind: row.item.kind,
        source_lang: row.item.source_lang,
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
          status: decision.archived ? 'archived' : 'new',
        })
        .eq('item_id', item.item_id)
        .eq('topic_id', item.topic_id)
        .eq('status', 'new') // the user may have moved it meanwhile
      if (error) throw error
      // Item-level facts: only fill what the collector did not know.
      const patch: Record<string, string> = {}
      if (!item.item_kind) patch.kind = decision.kind
      if (!item.source_lang && decision.language) patch.source_lang = decision.language
      if (Object.keys(patch).length) {
        const { error: itemError } = await db.from('items').update(patch).eq('id', item.item_id)
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
