import type { ItemTopicStatus } from './domain'

/**
 * Manual transitions allowed from the board.
 * `published` and `rejected` are locked: they never come back (anti-reproposition).
 * The only way back to `new` for a locked item is a tool update, handled by jobs.
 */
const MANUAL_TRANSITIONS: Record<ItemTopicStatus, readonly ItemTopicStatus[]> = {
  new: ['validated', 'rejected', 'archived'],
  validated: ['new', 'rejected'],
  archived: ['new', 'validated', 'rejected'],
  rejected: [],
  published: [],
}

export function canTransition(from: ItemTopicStatus, to: ItemTopicStatus): boolean {
  return MANUAL_TRANSITIONS[from].includes(to)
}
