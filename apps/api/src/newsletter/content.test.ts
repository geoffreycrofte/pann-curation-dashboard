import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { loadDigestContent } from './content'

type Row = Record<string, unknown>

/** In-memory tables behind the few query methods loadDigestContent uses. */
function fakeDb(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const query = {
        select: () => query,
        eq: (col: string, v: unknown) => ((rows = rows.filter((r) => r[col] === v)), query),
        in: (col: string, vs: unknown[]) => (
          (rows = rows.filter((r) => vs.includes(r[col]))),
          query
        ),
        gt: (col: string, v: string) => ((rows = rows.filter((r) => String(r[col]) > v)), query),
        order: (col: string) => (
          (rows = rows.sort((a, b) => String(a[col]).localeCompare(String(b[col])))),
          query
        ),
        limit: () => query,
        returns: () => query,
        then: (resolve: (r: { data: Row[]; error: null }) => void) =>
          resolve({ data: rows, error: null }),
      }
      return query
    },
  } as unknown as SupabaseClient
}

const link = (id: string, status: string, publish_at: string) => ({
  item_id: id,
  topic_id: 't1',
  module: 'curation',
  status,
  publish_at,
  item: { title: `Title ${id}`, canonical_url: `https://e.org/${id}`, source_lang: 'en' },
})

describe('loadDigestContent', () => {
  it('takes the items scheduled or published that no issue sent yet, in slot order', async () => {
    const db = fakeDb({
      item_topics: [
        link('published', 'published', '2026-11-05T08:00:00Z'),
        link('scheduled', 'validated', '2026-11-12T08:00:00Z'),
        // Validated with a time but no post waiting (all failed): not on the queue.
        link('failed', 'validated', '2026-11-06T08:00:00Z'),
        link('already-sent', 'published', '2026-11-04T08:00:00Z'),
        link('too-old', 'published', '2026-10-01T08:00:00Z'),
        link('no-summary', 'published', '2026-11-07T08:00:00Z'),
      ],
      posts: [{ item_id: 'scheduled', topic_id: 't1', status: 'scheduled' }],
      digests: [
        { id: 'd1', topic_id: 't1', lang: 'fr', status: 'sent' },
        { id: 'd2', topic_id: 't1', lang: 'fr', status: 'failed' },
      ],
      digest_items: [
        { digest_id: 'd1', item_id: 'already-sent' },
        // An issue that failed does not count: its items go out with the next one.
        { digest_id: 'd2', item_id: 'published' },
      ],
      summaries: ['published', 'scheduled', 'failed', 'already-sent', 'too-old'].map((id) => ({
        item_id: id,
        workspace_id: 'w1',
        lang: 'fr',
        summary: `Résumé ${id}`,
      })),
    })
    const content = await loadDigestContent(db, {
      topicId: 't1',
      workspaceId: 'w1',
      lang: 'fr',
      from: new Date('2026-11-01T00:00:00Z'),
    })
    expect(content.item_ids).toEqual(['published', 'scheduled'])
    expect(content.items[1]).toMatchObject({
      title: 'Title scheduled',
      summary: 'Résumé scheduled',
    })
    expect(content.without_summary).toBe(1)
  })
})
