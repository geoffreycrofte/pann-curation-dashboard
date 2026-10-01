import type { ItemTopicStatus } from './domain'

/**
 * Manual transitions allowed from the board. Keep in sync with the SQL trigger
 * private.check_item_topic_transition.
 * - `rejected` can be reconsidered by the user at any time, but jobs never re-propose it.
 * - `published` is final; only a tool update (handled by jobs) brings it back to `new`.
 */
const MANUAL_TRANSITIONS: Record<ItemTopicStatus, readonly ItemTopicStatus[]> = {
  new: ['validated', 'rejected', 'archived'],
  validated: ['new', 'rejected'],
  archived: ['new', 'validated', 'rejected'],
  rejected: ['new', 'validated'],
  published: [],
}

export function canTransition(from: ItemTopicStatus, to: ItemTopicStatus): boolean {
  return MANUAL_TRANSITIONS[from].includes(to)
}
