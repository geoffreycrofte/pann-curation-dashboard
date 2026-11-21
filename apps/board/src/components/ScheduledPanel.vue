<script setup lang="ts">
import { zonedDay } from '@pann/shared'
import { useQuery } from '@pinia/colada'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { api, type CompositionSummary, type QueueItem } from '../lib/api'
import { useNow } from '../lib/now'
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

// Posts of Création, when the topic uses it: in the same dated list as the news watch.
const { data: compositions } = useQuery({
  key: () => ['compositions', props.topicId],
  query: () => api.compositions(props.topicId),
  enabled: () => !!topic.value?.config.modules.compose,
})

type Entry =
  | { key: string; at: string; entry: QueueItem }
  | { key: string; at: string; composition: CompositionSummary }

/** Items with a post still waiting for its slot, and scheduled posts of Création,
 * grouped by day (time zone of the topic), in time order. */
const days = computed(() => {
  const all: Entry[] = [
    ...(queue.value ?? [])
      .filter((entry) => entry.posts.some((p) => p.status === 'scheduled'))
      .map((entry) => ({ key: `i-${entry.item_id}`, at: entry.publish_at, entry })),
    ...(topic.value?.config.modules.compose ? (compositions.value ?? []) : [])
      .filter((c) => c.status === 'scheduled' && c.publish_at)
      .map((c) => ({ key: `c-${c.id}`, at: c.publish_at!, composition: c })),
  ].sort((a, b) => a.at.localeCompare(b.at))
  const groups = new Map<string, Entry[]>()
  for (const entry of all) {
    const day = zonedDay(new Date(entry.at), timeZone.value)
    groups.set(day, [...(groups.get(day) ?? []), entry])
  }
  return [...groups]
})
const now = useNow()
const today = computed(() => zonedDay(now.value, timeZone.value))
const dayTitle = (day: string) => {
  const text = d(middayOf(day, timeZone.value), { dateStyle: 'full', timeZone: timeZone.value })
  return text.charAt(0).toUpperCase() + text.slice(1)
}
</script>

<template>
  <TabsRoot v-model="view" activation-mode="manual">
    <!-- The view switch: a compact segmented control, unlike the page's tabs above it. -->
    <div class="view-bar">
      <TabsList :aria-label="t('scheduled.views')" class="segmented">
        <TabsTrigger v-for="v in VIEWS" :key="v" :value="v" class="segment">
          {{ t(`scheduled.${v}`) }}
        </TabsTrigger>
      </TabsList>
      <p v-if="topic" class="hint">{{ t('scheduled.timezone', { timezone: timeZone }) }}</p>
    </div>

    <TabsContent value="list" class="subpanel">
      <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
      <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
      <p v-else-if="!days.length">{{ t('scheduled.empty') }}</p>
      <template v-else>
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
            <li v-for="item in entries" :key="item.key">
              <ScheduledEntry
                :topic-id="topicId"
                :entry="'entry' in item ? item.entry : undefined"
                :composition="'composition' in item ? item.composition : undefined"
                :time="zonedTime(item.at, timeZone)"
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
.view-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4);
  margin-bottom: var(--space-5);
}

.view-bar .hint {
  margin: 0;
}

.day + .day {
  margin-top: var(--space-6);
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
