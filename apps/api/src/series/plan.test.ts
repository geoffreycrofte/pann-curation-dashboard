import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { ComposeModel, StructuredCall } from '../compose/model'
import { runSeriesPlan, seriesSystemPrompt, seriesUserMessage } from './plan'

function fakeDb(status = 'pending') {
  const updates: Record<string, unknown>[] = []
  const ok = <T>(data: T) => Promise.resolve({ data, error: null })
  const db = {
    from(table: string) {
      if (table === 'usage_log') return { insert: () => ok(null) }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              ok({
                id: 's1',
                topic_id: 't1',
                subject: 'Le RGAA 5',
                notes: 'Entrée en vigueur en 2027.',
                post_count: 3,
                span_days: 14,
                ui_lang: 'fr',
                status,
                topic: {
                  workspace_id: 'w1',
                  config: { product: { name: 'Exemple', description: 'Un outil d’audit.' } },
                  monthly_budget_usd: 10,
                },
              }),
          }),
        }),
        update: (fields: Record<string, unknown>) => ({
          eq: () => (updates.push(fields), ok(null)),
        }),
      }
    },
    rpc(name: string) {
      if (name === 'topic_month_usage') return ok([])
      return ok([{ provider: 'anthropic', secret: 'sk' }])
    },
  } as unknown as SupabaseClient
  return { db, updates }
}

const usage = {
  input_tokens: 800,
  output_tokens: 400,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

describe('series plan', () => {
  it('grounds the plan in the notes and the product, in the person’s language', () => {
    expect(seriesSystemPrompt('fr')).toContain('in French')
    expect(seriesSystemPrompt('fr')).toContain('Never invent a figure')
    const message = seriesUserMessage({
      subject: 'S',
      notes: 'N',
      post_count: 4,
      span_days: 14,
      product: { name: 'Exemple', description: 'D', audience: '', messages: '' },
    })
    expect(message).toContain('Number of posts: 4, published over 14 days.')
    expect(message).toContain('Name: Exemple')
    expect(message).not.toContain('Audience:')
  })

  it('stores the plan, cut to the number of posts asked', async () => {
    const calls: StructuredCall[] = []
    const model: ComposeModel = async (call) => {
      calls.push(call)
      return {
        ok: true,
        usage,
        model: 'claude-sonnet-5-5',
        output: {
          posts: [
            { subject: 'Pourquoi', angle: 'A' },
            { subject: 'Quand', angle: 'B' },
            { subject: 'Comment', angle: 'C' },
            { subject: 'En trop', angle: 'D' },
          ],
        } as never,
      }
    }
    const { db, updates } = fakeDb()
    expect(await runSeriesPlan(db, 's1', model)).toBe('done')
    expect(updates[0]).toMatchObject({ status: 'ready' })
    expect((updates[0]!.plan as unknown[]).length).toBe(3)
    expect(calls[0]!.content).toContain('Entrée en vigueur en 2027.')
  })

  it('records a failure and skips what is not pending', async () => {
    const failing: ComposeModel = async () => ({ ok: false, error: 'refusal' })
    const { db, updates } = fakeDb()
    expect(await runSeriesPlan(db, 's1', failing)).toBe('refusal')
    expect(updates[0]).toMatchObject({ status: 'failed', error: 'refusal' })
    expect(await runSeriesPlan(fakeDb('ready').db, 's1', failing)).toBe('skipped')
  })
})
