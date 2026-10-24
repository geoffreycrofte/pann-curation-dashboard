import { describe, expect, it } from 'vitest'
import { claudeCostUsd } from './pricing'

describe('claudeCostUsd', () => {
  it('prices input, output and cache tokens', () => {
    // Sonnet 5.5: 2 $ / 10 $ per million; cache write 2.50 $, cache read 0.20 $
    const cost = claudeCostUsd('claude-sonnet-5-5', {
      input_tokens: 4000,
      output_tokens: 1500,
      cache_creation_input_tokens: 2000,
      cache_read_input_tokens: 10000,
    })
    expect(cost).toBeCloseTo((4000 * 2 + 2000 * 2.5 + 10000 * 0.2 + 1500 * 10) / 1e6, 10)
  })

  it('logs unknown models at zero instead of guessing', () => {
    expect(claudeCostUsd('some-future-model', { input_tokens: 1, output_tokens: 1 })).toBe(0)
  })
})
