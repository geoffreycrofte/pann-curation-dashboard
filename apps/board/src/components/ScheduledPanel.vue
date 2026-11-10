<script setup lang="ts">
import { zonedDay } from '@pann/shared'
import { useQuery } from '@pinia/colada'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { api, type QueueItem } from '../lib/api'
import { middayOf, zonedTime } from '../lib/zoned'
import ScheduledEntry from './ScheduledEntry.vue'
import ScheduledWeek from './ScheduledWeek.vue'

const props = defineProps<{ topicId: string }>()
const { t, d } = useI18n()
const route = useRoute()
const router = useRouter()

const VIEWS = ['list', 'week'] as const
type View = (typeof VIEWS)[number]
const view = computed<View>({
  get: () => (route.query.view === 'week' ? 'week' : 'list'),
  set: (value) =>
    router.replace({
      query: { ...route.query, view: value === 'list' ? undefined : value, week: undefined },
    }),
})

const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const timeZone = computed(() => topic.value?.config.schedule.timezone ?? 'UTC')

const {
  data: queue,
  isPending,
  error,
} = useQuery({
  key: () => ['queue', props.topicId],
  query: () => api.queue(props.topicId),
})

/** Items with a post still waiting for its slot, grouped by day (time zone of the topic). */
const days = computed(() => {
  const groups = new Map<string, QueueItem[]>()
  for (const entry of queue.value ?? []) {
    if (!entry.posts.some((p) => p.status === 'scheduled')) continue
    const day = zonedDay(new Date(entry.publish_at), timeZone.value)
    groups.set(day, [...(groups.get(day) ?? []), entry])
  }
  return [...groups]
})
const today = computed(() => zonedDay(new Date(), timeZone.value))
const dayTitle = (day: string) => {
  const text = d(middayOf(day, timeZone.value), { dateStyle: 'full', timeZone: timeZone.value })
  return text.charAt(0).toUpperCase() + text.slice(1)
}
</script>

<template>
  <TabsRoot v-model="view" activation-mode="manual">
    <TabsList :aria-label="t('scheduled.views')" class="subtabs tab-row">
      <TabsTrigger v-for="v in VIEWS" :key="v" :value="v" class="subtab">
        {{ t(`scheduled.${v}`) }}
      </TabsTrigger>
    </TabsList>

    <TabsContent value="list" class="subpanel">
      <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
      <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
      <p v-else-if="!days.length">{{ t('scheduled.empty') }}</p>
      <template v-else>
        <p class="hint">{{ t('scheduled.timezone', { timezone: timeZone }) }}</p>
        <section
          v-for="[day, entries] in days"
          :key="day"
          :aria-labelledby="`scheduled-${day}`"
          class="day"
        >
          <h2 :id="`scheduled-${day}`" class="day-title">
            {{ dayTitle(day) }}
            <span v-if="day === today" class="badge" data-tone="accent">{{
              t('scheduled.today')
            }}</span>
          </h2>
          <ol class="entries">
            <li v-for="entry in entries" :key="entry.item_id">
              <ScheduledEntry
                :topic-id="topicId"
                :entry="entry"
                :time="zonedTime(entry.publish_at, timeZone)"
              />
            </li>
          </ol>
        </section>
      </template>
    </TabsContent>

    <TabsContent value="week" class="subpanel">
      <ScheduledWeek v-if="topic" :topic-id="topicId" :topic="topic" />
      <p v-else role="status">{{ t('common.loading') }}</p>
    </TabsContent>
  </TabsRoot>
</template>

<style scoped>
.day {
  margin-top: var(--space-5);
}

.day-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  font-size: 1.125rem;
}

.entries {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
