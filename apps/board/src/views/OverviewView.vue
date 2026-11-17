<script setup lang="ts">
/**
 * Overview of a topic, where it opens: what needs doing, figures, the next publications.
 * The setup checklist of a new topic comes first (OverviewChecklist).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TopicSummary from '../components/TopicSummary.vue'
import { contentLangName } from '../lib/langs'
import { useTopicName } from '../lib/topic-name'
import { useTopicSummary } from '../lib/topic-summary'

const props = defineProps<{ topicId: string }>()
const { t, d } = useI18n()
const topicName = useTopicName(() => props.topicId)
const { topic, upcoming, isPending } = useTopicSummary(() => props.topicId)

const next = computed(() => upcoming.value.slice(0, 5))
const formatDate = (value: string) =>
  d(new Date(value), {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: topic.value?.config.schedule.timezone,
  })
</script>

<template>
  <h1 tabindex="-1">{{ topicName }}</h1>
  <TopicSummary :topic-id="topicId" />

  <section class="next" aria-labelledby="overview-next">
    <h2 id="overview-next">{{ t('overview.next') }}</h2>
    <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="!next.length">
      {{ t('overview.nothingScheduled') }}
      <RouterLink
        v-if="topic?.config.modules.curation"
        :to="{ name: 'board', params: { topicId }, query: { status: 'validated' } }"
        >{{ t('overview.chooseValidated') }}</RouterLink
      >
    </p>
    <ol v-else class="queue">
      <li v-for="item in next" :key="item.item_id">
        <p class="when">{{ formatDate(item.publish_at) }}</p>
        <p class="title">
          <RouterLink
            :to="{ name: 'item', params: { topicId, itemId: item.item_id } }"
            :lang="item.item.source_lang ?? undefined"
            >{{ item.item.title }}</RouterLink
          >
        </p>
        <p class="hint">
          {{
            item.posts
              .filter((p) => p.status === 'scheduled')
              .map((p) =>
                t('overview.postOn', {
                  channel: t(`draft.channels.${p.channel}`),
                  lang: contentLangName(p.lang),
                }),
              )
              .join(', ')
          }}
        </p>
      </li>
    </ol>
    <p>
      <RouterLink :to="{ name: 'calendar', params: { topicId } }">{{
        t('overview.openCalendar')
      }}</RouterLink>
    </p>
  </section>
</template>

<style scoped>
.next {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-8);
}

.next h2,
.next p {
  margin: 0;
}

.queue {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.queue li {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background: var(--color-surface);
}

.queue p {
  margin: 0;
}

.when {
  font-weight: 650;
}
</style>
