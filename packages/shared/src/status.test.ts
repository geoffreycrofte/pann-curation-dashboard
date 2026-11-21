import { describe, expect, it } from 'vitest'
import { canTransition } from './status'

describe('canTransition', () => {
  it('lets a new item be validated or rejected', () => {
    expect(canTransition('new', 'validated')).toBe(true)
    expect(canTransition('new', 'rejected')).toBe(true)
  })

  it('locks published items', () => {
    expect(canTransition('published', 'new')).toBe(false)
    expect(canTransition('published', 'rejected')).toBe(false)
  })

  it('lets the user change their mind about a rejected item', () => {
    expect(canTransition('rejected', 'new')).toBe(true)
    expect(canTransition('rejected', 'validated')).toBe(true)
    expect(canTransition('rejected', 'archived')).toBe(false)
  })

  it('does not let the board publish directly', () => {
    expect(canTransition('validated', 'published')).toBe(false)
  })
})

describe('conversations', () => {
  it('can be marked as replied, and taken back, only in the engagement tool', () => {
    expect(canTransition('validated', 'published', 'engagement')).toBe(true)
    expect(canTransition('published', 'validated', 'engagement')).toBe(true)
    expect(canTransition('new', 'published', 'engagement')).toBe(false)
    expect(canTransition('validated', 'published')).toBe(false)
    expect(canTransition('published', 'validated', 'curation')).toBe(false)
  })
})
