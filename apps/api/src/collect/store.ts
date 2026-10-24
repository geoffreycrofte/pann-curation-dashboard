import { PROVIDERS, parseTopicConfig, type Provider } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CollectStore, IngestStats } from './collect'
import type { CollectSecrets, CollectSource } from './types'

interface SourceRow extends Omit<CollectSource, 'workspace_id' | 'topic_config'> {
  topic: { workspace_id: string; active: boolean; config: unknown }
}

/** Supabase implementation. `db` must use the secret key (jobs only). */
export function supabaseCollectStore(db: SupabaseClient): CollectStore {
  return {
    async activeSources() {
      const { data, error } = await db
        .from('sources')
        .select(
          'id, topic_id, type, label, config, active, default_kind, interval_hours, last_run_at, run_requested_at, ' +
            'topic:topics!inner (workspace_id, active, config)',
        )
        .eq('active', true)
        .eq('topic.active', true)
        .returns<SourceRow[]>()
      if (error) throw error
      return data.map(({ topic, ...source }) => ({
        ...source,
        workspace_id: topic.workspace_id,
        topic_config: parseTopicConfig(topic.config),
      }))
    },

    async credentials(workspaceId) {
      const { data, error } = await db.rpc('workspace_credentials_for_jobs', {
        p_workspace_id: workspaceId,
      })
      if (error) throw error
      const secrets: CollectSecrets = {}
      for (const row of (data ?? []) as { provider: string; secret: string }[]) {
        if ((PROVIDERS as readonly string[]).includes(row.provider))
          secrets[row.provider as Provider] = row.secret
      }
      return secrets
    },

    async markCredentialInvalid(workspaceId, provider) {
      const { error } = await db
        .from('workspace_credentials')
        .update({
          status: 'invalid',
          status_detail: 'rejected_during_collection',
          checked_at: new Date().toISOString(),
        })
        .eq('workspace_id', workspaceId)
        .eq('provider', provider)
      if (error) throw error
    },

    async ingest(topicId, rows) {
      const { data, error } = await db.rpc('ingest_items', { p_topic_id: topicId, p_items: rows })
      if (error) throw error
      return data as IngestStats
    },

    async finishRun(sourceId, { at, error: lastError, stats }) {
      const { error } = await db
        .from('sources')
        .update({ last_run_at: at.toISOString(), last_error: lastError, last_run_stats: stats })
        .eq('id', sourceId)
      if (error) throw error
    },

    async logUsage(source, usage) {
      const { error } = await db.from('usage_log').insert(
        usage.map((u) => ({
          workspace_id: source.workspace_id,
          topic_id: source.topic_id,
          provider: u.provider,
          model: u.model ?? null,
          operation: u.operation,
          units: u.units,
          cost_usd: u.cost_usd,
        })),
      )
      if (error) throw error
    },
  }
}
