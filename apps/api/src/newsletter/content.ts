import type { DigestItem, Lang } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'

interface Row {
  item_id: string
  status: string
  publish_at: string
  item: { title: string; canonical_url: string; source_lang: string | null }
}

export interface DigestContent {
  items: DigestItem[]
  /** Ids of `items`, in the same order: recorded with the issue. */
  item_ids: string[]
  /** Items scheduled or published left out because they have no summary in this language yet. */
  without_summary: number
}

/** Most items in one issue. */
const MAX_ITEMS = 100

/**
 * The items of the next issue: scheduled (a post waits for its slot) or published on
 * the social networks since `from`, that no issue of this language holds yet (an issue
 * being sent or sent), with their summary in `lang`. In the order of their slot. Works
 * with the user's client (RLS: preview) and with the secret key (jobs: sending).
 */
export async function loadDigestContent(
  db: SupabaseClient,
  q: { topicId: string; workspaceId: string; lang: Lang; from: Date },
): Promise<DigestContent> {
  const { data, error } = await db
    .from('item_topics')
    .select('item_id, status, publish_at, item:items (title, canonical_url, source_lang)')
    .eq('topic_id', q.topicId)
    .eq('module', 'curation')
    .in('status', ['validated', 'published'])
    .gt('publish_at', q.from.toISOString())
    .order('publish_at', { ascending: true })
    .limit(MAX_ITEMS * 2)
    .returns<Row[]>()
  if (error) throw error
  const empty = { items: [], item_ids: [], without_summary: 0 }
  if (!data.length) return empty
  const ids = data.map((r) => r.item_id)

  const [sentIds, scheduledRes, summariesRes] = await Promise.all([
    sentItemIds(db, q.topicId, q.lang, ids),
    // A validated item with a publication time is on the queue only while a post waits.
    db
      .from('posts')
      .select('item_id')
      .eq('topic_id', q.topicId)
      .eq('status', 'scheduled')
      .in('item_id', ids),
    db
      .from('summaries')
      .select('item_id, summary')
      .eq('workspace_id', q.workspaceId)
      .eq('lang', q.lang)
      .in('item_id', ids),
  ])
  if (scheduledRes.error) throw scheduledRes.error
  if (summariesRes.error) throw summariesRes.error
  const sent = new Set(sentIds)
  const scheduled = new Set(scheduledRes.data.map((r) => r.item_id as string))
  const byItem = new Map(summariesRes.data.map((s) => [s.item_id as string, s.summary as string]))

  const eligible = data
    .filter((row) => !sent.has(row.item_id))
    .filter((row) => row.status === 'published' || scheduled.has(row.item_id))
    .slice(0, MAX_ITEMS)
  const kept = eligible.filter((row) => byItem.has(row.item_id))
  return {
    items: kept.map((row) => ({
      title: row.item.title,
      url: row.item.canonical_url,
      summary: byItem.get(row.item_id)!,
      source_lang: row.item.source_lang,
    })),
    item_ids: kept.map((row) => row.item_id),
    without_summary: eligible.length - kept.length,
  }
}

/** Of these items, those already held by an issue of this language (being sent or sent). */
async function sentItemIds(
  db: SupabaseClient,
  topicId: string,
  lang: Lang,
  itemIds: string[],
): Promise<string[]> {
  const { data: issues, error } = await db
    .from('digests')
    .select('id')
    .eq('topic_id', topicId)
    .eq('lang', lang)
    .in('status', ['scheduled', 'sent'])
  if (error) throw error
  if (!issues.length) return []
  const { data, error: itemsError } = await db
    .from('digest_items')
    .select('item_id')
    .in(
      'digest_id',
      issues.map((i) => i.id as string),
    )
    .in('item_id', itemIds)
  if (itemsError) throw itemsError
  return data.map((r) => r.item_id as string)
}

/** Start of the last issue sent: the next one looks back from there (digestWindowStart). */
export async function lastSentIssueStart(
  db: SupabaseClient,
  topicId: string,
  lang: Lang,
): Promise<Date | null> {
  const { data, error } = await db
    .from('digests')
    .select('period_from')
    .eq('topic_id', topicId)
    .eq('lang', lang)
    .eq('status', 'sent')
    .not('period_from', 'is', null)
    .order('period_to', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.period_from ? new Date(data.period_from as string) : null
}
