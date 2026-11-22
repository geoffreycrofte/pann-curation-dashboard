import { parseTopicConfig, type CredentialMeta, type DraftChannel, type Lang } from '@glimr/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listZernioAccounts } from './networks'
import { MEDIA_BUCKET } from '../compose/store'
import type { DueImage, DuePost, PublishCredentials, PublishStore } from './publish'

interface ClaimedRow {
  id: string
  item_id: string | null
  composition_id: string | null
  topic_id: string
  channel: DraftChannel
  lang: Lang | null
  body: string
  first_comment: string | null
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

      const unique = (values: (string | null)[]) => [
        ...new Set(values.filter((v): v is string => !!v)),
      ]
      const topicIds = unique(rows.map((r) => r.topic_id))
      const itemIds = unique(rows.map((r) => r.item_id))
      const compositionIds = unique(rows.map((r) => r.composition_id))
      const [topics, items, comps, media] = await Promise.all([
        db.from('topics').select('id, workspace_id, config').in('id', topicIds),
        itemIds.length
          ? db.from('items').select('id, canonical_url').in('id', itemIds)
          : { data: [], error: null },
        compositionIds.length
          ? db.from('compositions').select('id, link').in('id', compositionIds)
          : { data: [], error: null },
        compositionIds.length
          ? db
              .from('composition_media')
              .select('composition_id, storage_path, mime, width, height, alt, position')
              .in('composition_id', compositionIds)
              .order('position')
          : { data: [], error: null },
      ])
      for (const res of [topics, items, comps, media]) if (res.error) throw res.error
      const topicById = new Map((topics.data ?? []).map((t) => [t.id as string, t]))
      const urlById = new Map(
        (items.data ?? []).map((i) => [i.id as string, i.canonical_url as string]),
      )
      const linkById = new Map((comps.data ?? []).map((c) => [c.id as string, c.link as string]))

      // Signed addresses for an hour: Zernio fetches the images from them.
      const mediaRows = (media.data ?? []) as {
        composition_id: string
        storage_path: string
        mime: string
        width: number
        height: number
        alt: Record<string, string>
      }[]
      const signed = new Map<string, string>()
      if (mediaRows.length) {
        const { data: urls, error: signError } = await db.storage
          .from(MEDIA_BUCKET)
          .createSignedUrls(
            mediaRows.map((m) => m.storage_path),
            3600,
          )
        if (signError) throw signError
        for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl)
      }
      const imagesOf = (compositionId: string): DueImage[] =>
        mediaRows
          .filter((m) => m.composition_id === compositionId)
          .map((m) => ({
            path: m.storage_path,
            url: signed.get(m.storage_path) ?? '',
            mime: m.mime,
            width: m.width,
            height: m.height,
            alt: m.alt,
          }))

      return rows.flatMap((row): DuePost[] => {
        const topic = topicById.get(row.topic_id)
        if (!topic) return []
        const link = row.item_id ? urlById.get(row.item_id) : linkById.get(row.composition_id ?? '')
        if (link === undefined) return []
        return [
          {
            ...row,
            workspace_id: topic.workspace_id as string,
            link,
            images: row.composition_id ? imagesOf(row.composition_id) : [],
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
      // No Zernio key of its own: Glimr's, in platform mode, limited to its own profile.
      if (!result.zernio) {
        const { data: link, error: linkError } = await db
          .from('zernio_platform_links')
          .select('enabled, accounts')
          .eq('workspace_id', workspaceId)
          .maybeSingle<{ enabled: boolean; accounts: { id: string }[] }>()
        if (linkError) throw linkError
        if (link?.enabled) {
          const { data: platform, error: platformError } = await db.rpc(
            'platform_credentials_for_jobs',
          )
          if (platformError) throw platformError
          result.zernio = ((platform ?? []) as { provider: string; secret: string }[]).find(
            (k) => k.provider === 'zernio',
          )?.secret
          result.zernioAccounts = link.accounts.map((a) => a.id)
        }
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

    async finishComposition(compositionId) {
      const { data, error } = await db
        .from('posts')
        .select('status')
        .eq('composition_id', compositionId)
      if (error) throw error
      const statuses = data.map((p) => p.status as string)
      if (statuses.includes('scheduled') || !statuses.includes('sent')) return
      const { error: updateError } = await db
        .from('compositions')
        .update({ status: 'published' })
        .eq('id', compositionId)
        .eq('status', 'scheduled')
      if (updateError) throw updateError
    },

    async imageBytes(path) {
      const { data, error } = await db.storage.from(MEDIA_BUCKET).download(path)
      if (error) throw error
      return new Uint8Array(await data.arrayBuffer())
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
