import { useQuery } from '@pinia/colada'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { api, type QueueItem } from './api'

/**
 * What a topic needs now, for Today and the overview: items to sort, conversations to
 * review, coming publications, failures. Same query keys as the tool pages: shared cache,
 * and a change made there updates these figures.
 */
export function useTopicSummary(topicId: MaybeRefOrGetter<string>) {
  const id = () => toValue(topicId)
  const { data: topic } = useQuery({
    key: () => ['topic', id()],
    query: () => api.topic(id()),
  })
  const modules = computed(() => topic.value?.config.modules)
  const { data: curationCounts } = useQuery({
    key: () => ['items', id(), 'counts'],
    query: () => api.counts(id()),
    enabled: () => !!modules.value?.curation,
  })
  const { data: engagementCounts } = useQuery({
    key: () => ['conversations', id(), 'counts'],
    query: () => api.counts(id(), 'engagement'),
    enabled: () => !!modules.value?.engagement,
  })
  const { data: queue, isPending } = useQuery({
    key: () => ['queue', id()],
    query: () => api.queue(id()),
  })

  const hasPost = (item: QueueItem, status: string) => item.posts.some((p) => p.status === status)
  /** Next publications first. */
  const upcoming = computed(() =>
    (queue.value ?? [])
      .filter((item) => hasPost(item, 'scheduled'))
      .sort((a, b) => a.publish_at.localeCompare(b.publish_at)),
  )
  const failed = computed(() => (queue.value ?? []).filter((item) => hasPost(item, 'failed')))

  return {
    topic,
    modules,
    isPending,
    /** Every figure loaded: an empty summary can be told apart from one still coming. */
    isReady: computed(
      () =>
        !!topic.value &&
        !!queue.value &&
        (!modules.value?.curation || !!curationCounts.value) &&
        (!modules.value?.engagement || !!engagementCounts.value),
    ),
    toSort: computed(() => curationCounts.value?.new ?? 0),
    toReview: computed(() => engagementCounts.value?.new ?? 0),
    upcoming,
    failed,
  }
}
