import type { Topic } from '@pann/shared'
import { useQuery } from '@pinia/colada'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from './api'

/** Localised name of a topic, from the cached topic list. */
export function useTopicName(topicId: MaybeRefOrGetter<string>) {
  const { locale } = useI18n()
  const { data: topics } = useQuery({ key: ['topics'], query: api.topics })
  return computed(() => {
    const topic: Topic | undefined = topics.value?.find((tp) => tp.id === toValue(topicId))
    if (!topic) return ''
    return locale.value === 'fr' ? topic.name_fr : topic.name_en
  })
}
