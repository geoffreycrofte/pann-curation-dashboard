<script setup lang="ts">
/**
 * Figures of a topic that call for an action, each a link to where it is done. Used by
 * Today (one per topic) and by the overview of a topic.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'
import StatTile from './StatTile.vue'
import { useTopicSummary } from '../lib/topic-summary'

const props = withDefaults(
  defineProps<{
    topicId: string
    /** The date of the next post under its figure (off where the posts are listed). */
    showNext?: boolean
    /** Nothing waiting: one quiet line instead of a row of zeros (Today). */
    collapseIdle?: boolean
  }>(),
  { showNext: true, collapseIdle: false },
)
const { t, d } = useI18n()
const { topic, modules, isReady, toSort, toReview, upcoming, failed } = useTopicSummary(
  () => props.topicId,
)
const idle = computed(
  () =>
    props.collapseIdle &&
    isReady.value &&
    !toSort.value &&
    !toReview.value &&
    !upcoming.value.length &&
    !failed.value.length,
)

const timeZone = computed(() => topic.value?.config.schedule.timezone)
const next = computed(() => (props.showNext ? upcoming.value[0] : undefined))
const formatDate = (value: string) =>
  d(new Date(value), { dateStyle: 'full', timeStyle: 'short', timeZone: timeZone.value })
</script>

<template>
  <p v-if="idle" class="idle">
    <Icon name="circle-check" :size="18" />
    {{ t('summary.idle') }}
  </p>
  <ul v-else class="figures">
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
.idle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--color-text-muted);
}

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
