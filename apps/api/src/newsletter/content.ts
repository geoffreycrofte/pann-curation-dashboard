import type { DigestItem, Lang } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'

interface Row {
  item_id: string
  validated_at: string
  item: { title: string; canonical_url: string; source_lang: string | null }
}

export interface DigestContent {
  items: DigestItem[]
  /** Validated items left out because they have no summary in this language yet. */
  without_summary: number
}

/**
 * Items validated in (from, to] for this topic, with their summary in `lang`. Works with
 * the user's client (RLS: preview) and with the secret key (jobs: sending).
 */
export async function loadDigestContent(
  db: SupabaseClient,
  q: { topicId: string; workspaceId: string; lang: Lang; from: Date; to: Date },
): Promise<DigestContent> {
  const { data, error } = await db
    .from('item_topics')
    .select('item_id, validated_at, item:items (title, canonical_url, source_lang)')
    .eq('topic_id', q.topicId)
    .eq('module', 'curation')
    .in('status', ['validated', 'published'])
    .gt('validated_at', q.from.toISOString())
    .lte('validated_at', q.to.toISOString())
    .order('validated_at', { ascending: true })
    .limit(100)
    .returns<Row[]>()
  if (error) throw error
  if (!data.length) return { items: [], without_summary: 0 }

  const { data: summaries, error: sError } = await db
    .from('summaries')
    .select('item_id, summary')
    .eq('workspace_id', q.workspaceId)
    .eq('lang', q.lang)
    .in(
      'item_id',
      data.map((r) => r.item_id),
    )
  if (sError) throw sError
  const byItem = new Map(summaries.map((s) => [s.item_id as string, s.summary as string]))

  const items = data.flatMap((row): DigestItem[] => {
    const summary = byItem.get(row.item_id)
    return summary
      ? [
          {
            title: row.item.title,
            url: row.item.canonical_url,
            summary,
            source_lang: row.item.source_lang,
          },
        ]
      : []
  })
  return { items, without_summary: data.length - items.length }
}

/** End of the last issue sent (or skipped), where the next one starts. */
export async function lastIssueEnd(
  db: SupabaseClient,
  topicId: string,
  lang: Lang,
): Promise<Date | null> {
  const { data, error } = await db
    .from('digests')
    .select('period_to')
    .eq('topic_id', topicId)
    .eq('lang', lang)
    .in('status', ['sent', 'skipped'])
    .not('period_to', 'is', null)
    .order('period_to', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.period_to ? new Date(data.period_to as string) : null
}
