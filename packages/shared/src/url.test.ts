import { describe, expect, it } from 'vitest'
import { normalizeUrl } from './url'

describe('normalizeUrl', () => {
  it('forces https and strips www, fragment and trailing slash', () => {
    expect(normalizeUrl('http://www.W3.org/WAI/news/#top')).toBe('https://w3.org/WAI/news')
  })

  it('removes tracking parameters and sorts the others', () => {
    expect(normalizeUrl('https://example.com/a?utm_source=x&b=2&fbclid=y&a=1&UTM_Medium=z')).toBe(
      'https://example.com/a?a=1&b=2',
    )
  })

  it('keeps the root without a trailing slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com')
  })

  it('drops default ports and credentials', () => {
    expect(normalizeUrl('https://user:pw@example.com:443/x/')).toBe('https://example.com/x')
  })

  it('treats variants of the same article as identical', () => {
    const a = normalizeUrl('https://www.example.com/post/?utm_campaign=nl')
    const b = normalizeUrl('http://example.com/post#comments')
    expect(a).toBe(b)
  })

  it('rejects non-web protocols', () => {
    expect(() => normalizeUrl('mailto:someone@example.com')).toThrow()
  })
})
