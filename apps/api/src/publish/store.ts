import { parseTopicConfig, type CredentialMeta, type DraftChannel, type Lang } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listZernioAccounts } from './networks'
import type { DuePost, PublishCredentials, PublishStore } from './publish'

interface ClaimedRow {
  id: string
  item_id: string
  topic_id: string
  channel: DraftChannel
  lang: Lang | null
  body: string
  publish_attempts: number
}

/** Supabase implementation. `db` must use the secret key (jobs only). */
export function supabasePublishStore(db: SupabaseClient): PublishStore {
  return {
    async claimDue(limit) {
      const { data, error } = await db.rpc('claim_due_posts', { p_limit: limit })
      if (error) throw error
      const rows = (data ?? []) as ClaimedRow[]
      if (!rows.length) return []

      const topicIds = [...new Set(rows.map((r) => r.topic_id))]
      const itemIds = [...new Set(rows.map((r) => r.item_id))]
      const [topics, items] = await Promise.all([
        db.from('topics').select('id, workspace_id, config').in('id', topicIds),
        db.from('items').select('id, canonical_url').in('id', itemIds),
      ])
      if (topics.error) throw topics.error
      if (items.error) throw items.error
      const topicById = new Map(topics.data.map((t) => [t.id as string, t]))
      const urlById = new Map(items.data.map((i) => [i.id as string, i.canonical_url as string]))

      return rows.flatMap((row): DuePost[] => {
        const topic = topicById.get(row.topic_id)
        const url = urlById.get(row.item_id)
        if (!topic || !url) return []
        return [
          {
            ...row,
            workspace_id: topic.workspace_id as string,
            canonical_url: url,
            topic_config: parseTopicConfig(topic.config),
          },
        ]
      })
    },

    async credentials(workspaceId) {
      const [secrets, rows] = await Promise.all([
        db.rpc('workspace_credentials_for_jobs', { p_workspace_id: workspaceId }),
        db
          .from('workspace_credentials')
          .select('provider, account, meta')
          .eq('workspace_id', workspaceId)
          .in('provider', ['zernio', 'mastodon', 'bluesky', 'discord']),
      ])
      if (secrets.error) throw secrets.error
      if (rows.error) throw rows.error
      const keys = (secrets.data ?? []) as { provider: string; account: string; secret: string }[]
      const result: PublishCredentials = {
        zernio: keys.find((k) => k.provider === 'zernio')?.secret,
        mastodon: {},
        bluesky: {},
        discord: {},
      }
      for (const row of rows.data as {
        provider: string
        account: string
        meta: CredentialMeta
      }[]) {
        const secret = keys.find(
          (k) => k.provider === row.provider && k.account === row.account,
        )?.secret
        if (!secret) continue
        const { meta, account } = row
        if (row.provider === 'mastodon' && meta.instance)
          result.mastodon[account] = { token: secret, instance: meta.instance }
        if (row.provider === 'bluesky' && meta.did && meta.pds && meta.handle)
          result.bluesky[account] = {
            password: secret,
            did: meta.did,
            pds: meta.pds,
            handle: meta.handle,
          }
        if (row.provider === 'discord')
          result.discord[account] = { url: secret, guild_id: meta.guild_id }
      }
      return result
    },

    async markSent(post, result) {
      const { error } = await db
        .from('posts')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          external_id: result.external_id,
          published_url: result.url,
          last_error: null,
          claimed_at: null,
        })
        .eq('id', post.id)
      if (error) throw error
    },

    async markFailed(post, postError, final, retryAt) {
      const { error } = await db
        .from('posts')
        .update({
          last_error: postError,
          publish_attempts: post.publish_attempts + 1,
          claimed_at: null,
          ...(final
            ? { status: 'failed' }
            : { status: 'scheduled', scheduled_at: retryAt?.toISOString() }),
        })
        .eq('id', post.id)
      if (error) throw error
    },

    async release(post, retryAt) {
      const { error } = await db
        .from('posts')
        .update({ claimed_at: null, scheduled_at: retryAt.toISOString() })
        .eq('id', post.id)
      if (error) throw error
    },

    async markCredentialInvalid(workspaceId, provider, account = '') {
      const { error } = await db
        .from('workspace_credentials')
        .update({
          status: 'invalid',
          status_detail: 'rejected_during_publication',
          checked_at: new Date().toISOString(),
        })
        .eq('workspace_id', workspaceId)
        .eq('provider', provider)
        .eq('account', account)
      if (error) throw error
    },

    async finishItem(topicId, itemId) {
      const { data, error } = await db
        .from('posts')
        .select('status')
        .eq('topic_id', topicId)
        .eq('item_id', itemId)
      if (error) throw error
      const statuses = data.map((p) => p.status as string)
      if (statuses.includes('scheduled') || !statuses.includes('sent')) return
      const { error: updateError } = await db
        .from('item_topics')
        .update({ status: 'published' })
        .eq('topic_id', topicId)
        .eq('item_id', itemId)
        .eq('status', 'validated')
      if (updateError) throw updateError
    },
  }
}

/** Lists the Zernio accounts again (new account connected in Zernio, reconnection). */
export async function refreshZernioAccounts(db: SupabaseClient, workspaceId: string) {
  const { data, error } = await db.rpc('workspace_credentials_for_jobs', {
    p_workspace_id: workspaceId,
  })
  if (error) throw error
  const key = ((data ?? []) as { provider: string; secret: string }[]).find(
    (r) => r.provider === 'zernio',
  )?.secret
  if (!key) return
  const result = await listZernioAccounts(key)
  const now = new Date().toISOString()
  const update = result.ok
    ? {
        status: 'ok',
        status_detail: null,
        checked_at: now,
        meta: { accounts: result.accounts, refreshed_at: now } satisfies CredentialMeta,
      }
    : result.invalid
      ? { status: 'invalid', status_detail: 'invalid_key', checked_at: now }
      : { status_detail: 'provider_unreachable' }
  const { error: updateError } = await db
    .from('workspace_credentials')
    .update(update)
    .eq('workspace_id', workspaceId)
    .eq('provider', 'zernio')
  if (updateError) throw updateError
}
