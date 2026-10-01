import { describe, expect, it } from 'vitest'
import { canTransition } from './status'

describe('canTransition', () => {
  it('lets a new item be validated or rejected', () => {
    expect(canTransition('new', 'validated')).toBe(true)
    expect(canTransition('new', 'rejected')).toBe(true)
  })

  it('locks published and rejected items', () => {
    expect(canTransition('published', 'new')).toBe(false)
    expect(canTransition('rejected', 'new')).toBe(false)
    expect(canTransition('rejected', 'validated')).toBe(false)
  })

  it('does not let the board publish directly', () => {
    expect(canTransition('validated', 'published')).toBe(false)
  })
})
