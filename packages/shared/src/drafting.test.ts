import { describe, expect, it } from 'vitest'
import { postLength } from './drafting'

describe('postLength', () => {
  it('counts what a person sees, not UTF-16 units', () => {
    expect(postLength('é')).toBe(1)
    expect(postLength('é')).toBe(1)
    expect(postLength('👩‍💻 ok')).toBe(4)
  })
})
