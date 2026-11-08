import { kindLabel, type Lang } from '@pann/shared'
import { useQuery } from '@pinia/colada'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from './api'

/** Kinds of content of a topic (its settings), and their label in the interface language. */
export function useTopicKinds(topicId: MaybeRefOrGetter<string>) {
  const { locale } = useI18n()
  // Same key as the other reads of the topic: one request, shared cache.
  const { data } = useQuery({
    key: () => ['topic', toValue(topicId)],
    query: () => api.topic(toValue(topicId)),
  })
  const kinds = computed(() => data.value?.config.kinds ?? [])
  function label(key: string): string {
    return data.value ? kindLabel(data.value.config, key, locale.value as Lang) : key
  }
  return { kinds, label }
}
