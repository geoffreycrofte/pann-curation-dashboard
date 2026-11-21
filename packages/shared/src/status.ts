import type { ItemTopicStatus } from './domain'
import type { TopicModule } from './topic-config'

/**
 * Manual transitions allowed from the board. Keep in sync with the SQL trigger
 * private.check_item_topic_transition.
 * - `rejected` can be reconsidered by the user at any time, but jobs never re-propose it.
 * - `published` is final; only a tool update (handled by jobs) brings it back to `new`.
 * - Conversations (engagement) have no publication: `published` means the person replied
 *   themself ("Mark as replied"), and they can take it back.
 */
const MANUAL_TRANSITIONS: Record<ItemTopicStatus, readonly ItemTopicStatus[]> = {
  new: ['validated', 'rejected', 'archived'],
  validated: ['new', 'rejected'],
  archived: ['new', 'validated', 'rejected'],
  rejected: ['new', 'validated'],
  published: [],
}

const ENGAGEMENT_TRANSITIONS: Partial<Record<ItemTopicStatus, readonly ItemTopicStatus[]>> = {
  validated: ['published'],
  published: ['validated'],
}

export function canTransition(
  from: ItemTopicStatus,
  to: ItemTopicStatus,
  module: TopicModule = 'curation',
): boolean {
  return (
    MANUAL_TRANSITIONS[from].includes(to) ||
    (module === 'engagement' && (ENGAGEMENT_TRANSITIONS[from] ?? []).includes(to))
  )
}
