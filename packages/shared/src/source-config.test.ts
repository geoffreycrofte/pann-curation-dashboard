import { describe, expect, it } from 'vitest'
import { exaSourceConfigSchema, isExcludedUrl, siteOf, slugify } from './source-config'

describe('exaSourceConfigSchema', () => {
  it('reduces domains to their host and rejects invalid ones', () => {
    const config = exaSourceConfigSchema.parse({
      query: 'news',
      include_domains: ['https://www.W3.org/WAI/', 'example.org'],
    })
    expect(config.include_domains).toEqual(['w3.org', 'example.org'])
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

describe('excluded sites', () => {
  it('gives the site of a URL without www', () => {
    expect(siteOf('https://www.Example.org/a?b=1')).toBe('example.org')
    expect(siteOf('not a url')).toBeNull()
  })

  it('matches the domain and its subdomains only', () => {
    const excluded = ['example.org']
    expect(isExcludedUrl('https://example.org/x', excluded)).toBe(true)
    expect(isExcludedUrl('https://blog.example.org/x', excluded)).toBe(true)
    expect(isExcludedUrl('https://notexample.org/x', excluded)).toBe(false)
    expect(isExcludedUrl('https://example.org/x', [])).toBe(false)
  })
})
