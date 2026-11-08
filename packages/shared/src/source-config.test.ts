import { describe, expect, it } from 'vitest'
import { exaSourceConfigSchema, slugify } from './source-config'

describe('exaSourceConfigSchema', () => {
  it('reduces domains to their host and rejects invalid ones', () => {
    const config = exaSourceConfigSchema.parse({
      query: 'news',
      include_domains: ['https://www.W3.org/WAI/', 'example.org'],
    })
    expect(config.include_domains).toEqual(['www.w3.org', 'example.org'])
    expect(config.num_results).toBe(10)
    expect(
      exaSourceConfigSchema.safeParse({ query: 'x', exclude_domains: ['not a domain'] }).success,
    ).toBe(false)
  })
})

describe('slugify', () => {
  it('keeps letters and digits, without accents', () => {
    expect(slugify('Accessibilité numérique !')).toBe('accessibilite-numerique')
    expect(slugify('***')).toBe('topic')
  })
})
