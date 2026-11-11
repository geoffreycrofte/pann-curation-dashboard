import {
  parseTopicConfig,
  type BrevoSender,
  type CredentialMeta,
  type NewsletterProvider,
} from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readBrevoAccount } from './brevo'
import { readSendfoxAccount } from './sendfox'
import { lastSentIssueStart, loadDigestContent } from './content'
import type { DigestStore } from './digest'

const day = (date: Date) => date.toISOString().slice(0, 10)

async function providerKey(db: SupabaseClient, workspaceId: string, provider: NewsletterProvider) {
  const { data, error } = await db.rpc('workspace_credentials_for_jobs', {
    p_workspace_id: workspaceId,
  })
  if (error) throw error
  return ((data ?? []) as { provider: string; secret: string }[]).find(
    (r) => r.provider === provider,
  )?.secret
}

/** Supabase implementation. `db` must use the secret key (jobs only). */
export function supabaseDigestStore(db: SupabaseClient): DigestStore {
  return {
    async topics(topicId) {
      let query = db
        .from('topics')
        .select('id, workspace_id, slug, name_fr, name_en, config')
        .eq('active', true)
      if (topicId) query = query.eq('id', topicId)
      const { data, error } = await query
      if (error) throw error
      return data.map((t) => ({ ...t, config: parseTopicConfig(t.config) }))
    },

    async issueExists(topicId, lang, periodTo) {
      const { count, error } = await db
        .from('digests')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topicId)
        .eq('lang', lang)
        .eq('period_to', periodTo.toISOString())
      if (error) throw error
      return (count ?? 0) > 0
    },

    lastSentIssueStart: (topicId, lang) => lastSentIssueStart(db, topicId, lang),
    content: (q) => loadDigestContent(db, q),
    newsletterKey: (workspaceId, provider) => providerKey(db, workspaceId, provider),

    async createIssue(row) {
      const { data, error } = await db
        .from('digests')
        .insert({
          topic_id: row.topic_id,
          lang: row.lang,
          period_start: day(row.period_from),
          period_end: day(row.period_to),
          period_from: row.period_from.toISOString(),
          period_to: row.period_to.toISOString(),
          status: row.status,
          subject: row.subject ?? null,
          item_count: row.item_count ?? 0,
          last_error: row.last_error ?? null,
        })
        .select('id')
        .single()
      if (error?.code === '23505') return null
      if (error) throw error
      return data.id as string
    },

    async addIssueItems(issueId, itemIds) {
      if (!itemIds.length) return
      const { error } = await db
        .from('digest_items')
        .insert(itemIds.map((item_id) => ({ digest_id: issueId, item_id })))
      if (error) throw error
    },

    async updateIssue(id, patch) {
      const { error } = await db
        .from('digests')
        .update({
          ...patch,
          sent_at: patch.sent_at?.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },

    async markCredentialInvalid(workspaceId, provider) {
      const { error } = await db
        .from('workspace_credentials')
        .update({
          status: 'invalid',
          status_detail: 'rejected_during_newsletter',
          checked_at: new Date().toISOString(),
        })
        .eq('workspace_id', workspaceId)
        .eq('provider', provider)
      if (error) throw error
    },
  }
}

/** Lists (and Brevo senders) read again: a new list, a sender validated… */
export async function refreshNewsletterAccount(
  db: SupabaseClient,
  workspaceId: string,
  provider: NewsletterProvider,
) {
  const key = await providerKey(db, workspaceId, provider)
  if (!key) return
  const brevo = provider === 'brevo' ? await readBrevoAccount(key) : null
  const result = brevo ?? (await readSendfoxAccount(key))
  // Brevo only: the senders to choose from.
  const senders: BrevoSender[] | undefined = brevo?.ok ? brevo.senders : undefined
  const now = new Date().toISOString()
  const update = result.ok
    ? {
        status: 'ok',
        status_detail: null,
        checked_at: now,
        meta: {
          lists: result.lists,
          ...(senders ? { senders } : {}),
          refreshed_at: now,
        } satisfies CredentialMeta,
      }
    : result.detail === 'provider_unreachable'
      ? { status_detail: 'provider_unreachable' }
      : { status: 'invalid', status_detail: result.detail, checked_at: now }
  const { error } = await db
    .from('workspace_credentials')
    .update(update)
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
  if (error) throw error
}
