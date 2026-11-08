import { parseTopicConfig } from '@pann/shared'
import { describe, expect, it } from 'vitest'
import { rewriteRequestSchema, rewriteSystemPrompt, rewriteUserMessage } from './prompt'

const config = parseTopicConfig({ ai: { post_rules: 'Two hashtags at most.' } })
const topic = { name_en: 'Digital accessibility', config }

describe('rewrite prompt', () => {
  it('asks for a post without URL, under the length left by the link, with the post rules', () => {
    const system = rewriteSystemPrompt(topic, { kind: 'post', lang: 'fr', channel: 'bluesky' }, 270)
    expect(system).toContain('Bluesky post')
    expect(system).toContain('never write a URL')
    expect(system).toContain('must not exceed 270 characters')
    expect(system).toContain('Write in French')
    expect(system).toContain('Two hashtags at most.')
  })

  it('turns a preset or a custom instruction into the user message', () => {
    const base = { text: 'Un texte.', target: { kind: 'summary', lang: 'fr' } } as const
    expect(rewriteUserMessage({ ...base, preset: 'shorter' })).toContain('shorter')
    expect(
      rewriteUserMessage({ ...base, preset: 'custom', instruction: 'Cite la norme.' }),
    ).toContain('Instruction: Cite la norme.')
  })

  it('needs an instruction for a custom rewrite', () => {
    const request = { text: 'x', preset: 'custom', target: { kind: 'summary', lang: 'en' } }
    expect(rewriteRequestSchema.safeParse(request).success).toBe(false)
  })
})
