<script setup lang="ts">
/**
 * Création posts in the Calendar: the scheduled ones (by time) or the published ones
 * (latest first), with a link to each. Shown when the topic uses the Création tool.
 */
import { useQuery } from '@pinia/colada'
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../lib/api'

const props = defineProps<{ topicId: string; status: 'scheduled' | 'published' }>()
const { t, d } = useI18n()
const id = useId()

const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const { data: compositions } = useQuery({
  key: () => ['compositions', props.topicId],
  query: () => api.compositions(props.topicId),
  enabled: () => !!topic.value?.config.modules.compose,
})
const list = computed(() => {
  const found = (compositions.value ?? []).filter((c) => c.status === props.status)
  return props.status === 'scheduled'
    ? found.sort((a, b) => (a.publish_at ?? '').localeCompare(b.publish_at ?? ''))
    : found.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 20)
})
const formatDate = (value: string) =>
  d(new Date(value), {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: topic.value?.config.schedule.timezone,
  })
</script>

<template>
  <section v-if="list.length" class="compose-queue" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`">{{ t(`compose.calendar.${status}`) }}</h2>
    <ul>
      <li v-for="c in list" :key="c.id">
        <RouterLink :to="{ name: 'composition', params: { topicId, compositionId: c.id } }">
          {{ c.subject || t('compose.untitled') }}
        </RouterLink>
        <span v-if="status === 'scheduled' && c.publish_at" class="when">
          {{ formatDate(c.publish_at) }}
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.compose-queue {
  margin-bottom: var(--space-6);
}

.compose-queue h2 {
  font-size: 1.25rem;
}

ul {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.when {
  color: var(--color-text-muted);
}
</style>
