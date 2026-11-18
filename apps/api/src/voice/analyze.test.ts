import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { ComposeModel } from '../compose/model'
import { runVoiceAnalysis, voiceSystemPrompt } from './analyze'

function fakeDb(state: { status: string; spent: number; key?: string }) {
  const updates: Record<string, unknown>[] = []
  const usage: Record<string, unknown>[] = []
  const ok = <T>(data: T) => Promise.resolve({ data, error: null })
  const db = {
    from(table: string) {
      if (table === 'usage_log')
        return { insert: (r: Record<string, unknown>) => (usage.push(r), ok(null)) }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              ok({
                id: 'v1',
                topic_id: 't1',
                samples: 'Mon post. #Exemple',
                ui_lang: 'fr',
                status: state.status,
                topic: { workspace_id: 'w1', config: {}, monthly_budget_usd: 10 },
              }),
          }),
        }),
        update: (fields: Record<string, unknown>) => ({
          eq: () => (updates.push(fields), ok(null)),
        }),
      }
    },
    rpc(name: string) {
      if (name === 'topic_month_usage') return ok([{ cost_usd: state.spent }])
      return ok(state.key ? [{ provider: 'anthropic', secret: state.key }] : [])
    },
  } as unknown as SupabaseClient
  return { db, updates, usage }
}

const usage = {
  input_tokens: 500,
  output_tokens: 200,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}
const model: ComposeModel = async () => ({
  ok: true,
  output: {
    style_rules: 'Tutoyer.\nPhrases courtes.',
    post_rules: 'Un hashtag en fin de post.',
  } as never,
  usage,
  model: 'claude-sonnet-5-5',
})

describe('voice analysis', () => {
  it('asks for rules in the language of the person, from the samples only', () => {
    const prompt = voiceSystemPrompt('fr')
    expect(prompt).toContain('Write the rules in French')
    expect(prompt).toContain('Describe only what the posts show')
  })

  it('stores the proposed rules without touching the topic, and logs the cost', async () => {
    const { db, updates, usage: log } = fakeDb({ status: 'pending', spent: 0, key: 'sk' })
    expect(await runVoiceAnalysis(db, 'v1', model)).toBe('done')
    expect(updates[0]).toMatchObject({
      status: 'done',
      result: {
        style_rules: 'Tutoyer.\nPhrases courtes.',
        post_rules: 'Un hashtag en fin de post.',
      },
    })
    expect(log[0]).toMatchObject({ operation: 'voice', topic_id: 't1' })
  })

  it('stops on budget or without key, and skips what is not pending', async () => {
    expect(
      await runVoiceAnalysis(fakeDb({ status: 'pending', spent: 10, key: 'sk' }).db, 'v1', model),
    ).toBe('budget_exceeded')
    expect(await runVoiceAnalysis(fakeDb({ status: 'pending', spent: 0 }).db, 'v1', model)).toBe(
      'missing_credential',
    )
    expect(
      await runVoiceAnalysis(fakeDb({ status: 'done', spent: 0, key: 'sk' }).db, 'v1', model),
    ).toBe('skipped')
  })
})
