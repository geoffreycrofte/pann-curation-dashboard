<script setup lang="ts">
/**
 * Figures of a topic that call for an action, each a link to where it is done. Used by
 * Today (one per topic) and by the overview of a topic.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTopicSummary } from '../lib/topic-summary'

const props = defineProps<{ topicId: string }>()
const { t, d } = useI18n()
const { topic, modules, toSort, toReview, upcoming, failed } = useTopicSummary(() => props.topicId)

const timeZone = computed(() => topic.value?.config.schedule.timezone)
const next = computed(() => upcoming.value[0])
const formatDate = (value: string) =>
  d(new Date(value), { dateStyle: 'full', timeStyle: 'short', timeZone: timeZone.value })
</script>

<template>
  <ul class="figures">
    <li v-if="modules?.curation">
      <RouterLink :to="{ name: 'board', params: { topicId }, query: { status: 'new' } }">
        <span class="number">{{ toSort }}</span>
        {{ t('summary.toSort', toSort) }}
      </RouterLink>
    </li>
    <li v-if="modules?.engagement">
      <RouterLink :to="{ name: 'engagement', params: { topicId }, query: { status: 'new' } }">
        <span class="number">{{ toReview }}</span>
        {{ t('summary.toReview', toReview) }}
      </RouterLink>
    </li>
    <li>
      <RouterLink :to="{ name: 'calendar', params: { topicId } }">
        <span class="number">{{ upcoming.length }}</span>
        {{ t('summary.upcoming', upcoming.length) }}
      </RouterLink>
      <span v-if="next" class="hint next">
        {{ t('summary.next', { date: formatDate(next.publish_at) }) }}
      </span>
    </li>
    <li v-if="failed.length" class="failed">
      <RouterLink :to="{ name: 'calendar', params: { topicId }, query: { tab: 'history' } }">
        <span class="number">{{ failed.length }}</span>
        {{ t('summary.failed', failed.length) }}
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.figures {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(12rem, 100%), 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.figures li {
  display: grid;
  gap: var(--space-1);
}

.figures a {
  display: grid;
  align-content: start;
  gap: var(--space-1);
  min-height: 2.75rem;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  text-decoration: none;
}

.figures a:hover {
  border-color: var(--color-text);
}

.number {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1;
}

.failed a {
  border-color: var(--color-danger);
}

.next {
  padding: 0 var(--space-1);
}
</style>
