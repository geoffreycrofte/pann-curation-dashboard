import { describe, expect, it } from 'vitest'
import { errorCode, parseErrorCode, requiredProvider } from './providers'

describe('error codes', () => {
  it('round-trips codes with a detail', () => {
    expect(parseErrorCode(errorCode('missing_credential', 'exa'))).toEqual({
      code: 'missing_credential',
      detail: 'exa',
    })
    expect(parseErrorCode(errorCode('http', 503))).toEqual({ code: 'http', detail: '503' })
    expect(parseErrorCode('timeout')).toEqual({ code: 'timeout', detail: undefined })
  })

  it('does not interpret free text', () => {
    expect(parseErrorCode('Something broke: badly')).toBeNull()
  })
})

describe('requiredProvider', () => {
  it('only Exa sources cannot run without a key', () => {
    expect(requiredProvider('exa')).toBe('exa')
    expect(requiredProvider('github')).toBeNull()
    expect(requiredProvider('rss')).toBeNull()
  })
})
