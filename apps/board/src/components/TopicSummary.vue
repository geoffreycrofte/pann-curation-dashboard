<script setup lang="ts">
/**
 * Figures of a topic that call for an action, each a link to where it is done. Used by
 * Today (one per topic) and by the overview of a topic.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import StatTile from './StatTile.vue'
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
      <StatTile
        icon="inbox"
        tone="publication"
        :value="toSort"
        :label="t('summary.toSort', toSort)"
        :to="{ name: 'board', params: { topicId }, query: { status: 'new' } }"
      />
    </li>
    <li v-if="modules?.engagement">
      <StatTile
        icon="messages"
        tone="conversation"
        :value="toReview"
        :label="t('summary.toReview', toReview)"
        :to="{ name: 'engagement', params: { topicId }, query: { status: 'new' } }"
      />
    </li>
    <li>
      <StatTile
        icon="calendar"
        :value="upcoming.length"
        :label="t('summary.upcoming', upcoming.length)"
        :hint="next ? t('summary.next', { date: formatDate(next.publish_at) }) : undefined"
        :to="{ name: 'calendar', params: { topicId } }"
      />
    </li>
    <li v-if="failed.length">
      <StatTile
        icon="alert-circle"
        tone="danger"
        :value="failed.length"
        :label="t('summary.failed', failed.length)"
        :to="{ name: 'calendar', params: { topicId }, query: { tab: 'history' } }"
      />
    </li>
  </ul>
</template>

<style scoped>
.figures {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(14rem, 100%), 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.figures li {
  display: grid;
}
</style>
