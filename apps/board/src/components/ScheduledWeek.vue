<script setup lang="ts">
import { addDays, dailySlots, startOfWeek, zonedDay, zonedTimeToUtc } from '@glimr/shared'
import { useQuery } from '@pinia/colada'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { api, type CompositionSummary, type QueueItem, type TopicWithConfig } from '../lib/api'
import { useNow } from '../lib/now'
import { middayOf, zonedTime } from '../lib/zoned'
import ScheduledEntry from './ScheduledEntry.vue'

const props = defineProps<{ topicId: string; topic: TopicWithConfig }>()
const { t, d } = useI18n()
const route = useRoute()
const router = useRouter()

const timeZone = computed(() => props.topic.config.schedule.timezone)
const now = useNow()
const today = computed(() => zonedDay(now.value, timeZone.value))
const thisWeek = computed(() => startOfWeek(today.value))

// The week shown lives in the address: back, reload and sharing keep it.
const monday = computed({
  get: () => {
    const q = route.query.week
    return typeof q === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q) ? startOfWeek(q) : thisWeek.value
  },
  set: (value) =>
    router.replace({
      query: { ...route.query, week: value === thisWeek.value ? undefined : value },
    }),
})
const days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(monday.value, i)))

const { data, isPending, error } = useQuery({
  key: () => ['queue', props.topicId, 'week', monday.value],
  query: () =>
    api.queue(props.topicId, {
      from: zonedTimeToUtc(monday.value, '00:00', timeZone.value).toISOString(),
      to: zonedTimeToUtc(addDays(monday.value, 7), '00:00', timeZone.value).toISOString(),
    }),
})

// Posts of Création, when the topic uses it: planned beside the news watch. They have
// slots of their own, so they never take a free slot of the news watch.
const { data: compositions } = useQuery({
  key: () => ['compositions', props.topicId],
  query: () => api.compositions(props.topicId),
  enabled: () => props.topic.config.modules.compose,
})

type Slot =
  | { kind: 'item'; time: string; entry: QueueItem }
  | { kind: 'composition'; time: string; composition: CompositionSummary }
  | { kind: 'free'; time: string }

const slots = computed(() => dailySlots(props.topic.config.schedule))
const nowTime = computed(() => zonedTime(now.value, timeZone.value))

/** Per day: its items and, from now on, the daily slots no item takes yet. */
const planning = computed(() => {
  const byDay = new Map<string, Slot[]>(days.value.map((day) => [day, []]))
  for (const entry of data.value ?? []) {
    // An item with no post left to show (all back to drafts) has nothing to plan.
    if (!entry.posts.length) continue
    byDay
      .get(zonedDay(new Date(entry.publish_at), timeZone.value))
      ?.push({ kind: 'item', time: zonedTime(entry.publish_at, timeZone.value), entry })
  }
  const taken = new Map<string, Set<string>>(
    [...byDay].map(([day, list]) => [day, new Set(list.map((s) => s.time))]),
  )
  if (props.topic.config.modules.compose)
    for (const c of compositions.value ?? []) {
      if (c.status !== 'scheduled' || !c.publish_at) continue
      byDay.get(zonedDay(new Date(c.publish_at), timeZone.value))?.push({
        kind: 'composition',
        time: zonedTime(c.publish_at, timeZone.value),
        composition: c,
      })
    }
  for (const [day, list] of byDay) {
    list.sort((a, b) => a.time.localeCompare(b.time))
    if (day < today.value) continue
    const used = taken.get(day)!
    for (const time of slots.value) {
      if (used.has(time) || (day === today.value && time <= nowTime.value)) continue
      list.push({ kind: 'free', time })
    }
    list.sort((a, b) => a.time.localeCompare(b.time))
  }
  return [...byDay]
})

const dayName = (day: string) =>
  d(middayOf(day, timeZone.value), { weekday: 'long', timeZone: timeZone.value })
const dayDate = (day: string) =>
  d(middayOf(day, timeZone.value), { day: 'numeric', month: 'short', timeZone: timeZone.value })
const heading = computed(() =>
  t('scheduled.weekHeading', {
    from: d(middayOf(days.value[0]!, timeZone.value), {
      day: 'numeric',
      month: 'long',
      timeZone: timeZone.value,
    }),
    to: d(middayOf(days.value[6]!, timeZone.value), {
      dateStyle: 'long',
      timeZone: timeZone.value,
    }),
  }),
)
</script>

<template>
  <div class="week-head">
    <h2 id="scheduled-week" aria-live="polite">{{ heading }}</h2>
    <div class="week-nav">
      <button type="button" class="button" data-size="small" @click="monday = addDays(monday, -7)">
        <span aria-hidden="true">←</span> {{ t('scheduled.previousWeek') }}
      </button>
      <button
        type="button"
        class="button"
        data-size="small"
        :disabled="monday === thisWeek"
        @click="monday = thisWeek"
      >
        {{ t('scheduled.thisWeek') }}
      </button>
      <button type="button" class="button" data-size="small" @click="monday = addDays(monday, 7)">
        {{ t('scheduled.nextWeek') }} <span aria-hidden="true">→</span>
      </button>
    </div>
  </div>

  <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <div v-else class="week-frame">
    <ol class="week" aria-labelledby="scheduled-week">
      <li
        v-for="[day, list] in planning"
        :key="day"
        class="day"
        :data-today="day === today || undefined"
        :data-past="day < today || undefined"
      >
        <h3 class="day-head">
          <span class="day-name">{{ dayName(day) }}</span>
          <span class="day-date">{{ dayDate(day) }}</span>
          <span v-if="day === today" class="badge" data-tone="accent">{{
            t('scheduled.today')
          }}</span>
        </h3>
        <ol v-if="list.length" class="slots">
          <li
            v-for="slot in list"
            :key="
              slot.kind === 'item'
                ? slot.entry.item_id
                : slot.kind === 'composition'
                  ? slot.composition.id
                  : slot.time
            "
          >
            <ScheduledEntry
              v-if="slot.kind === 'item'"
              :topic-id="topicId"
              :entry="slot.entry"
              :time="slot.time"
              compact
            />
            <ScheduledEntry
              v-else-if="slot.kind === 'composition'"
              :topic-id="topicId"
              :composition="slot.composition"
              :time="slot.time"
              compact
            />
            <p v-else class="free">
              <span class="free-time">{{ slot.time }}</span> {{ t('scheduled.freeSlot') }}
            </p>
          </li>
        </ol>
        <p v-else class="nothing">{{ t('scheduled.nothingThisDay') }}</p>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.week-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.week-head h2 {
  margin: 0;
  font-size: 1.25rem;
}

.week-nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.week-frame {
  container-type: inline-size;
  margin-top: var(--space-5);
}

/* One day per row. Wide enough: the day on the left, its slots side by side. */
.week {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.day {
  display: grid;
  align-content: start;
  gap: var(--space-2) var(--space-4);
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface-2);
}

.day > * {
  min-width: 0;
}

@container (min-width: 40rem) {
  .day {
    grid-template-columns: 8.5rem minmax(0, 1fr);
    align-items: start;
  }

  .day-head {
    flex-direction: column;
    align-items: start;
    padding-top: var(--space-2);
  }

  .slots {
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  }
}

.day[data-today] {
  border: 2px solid var(--color-text);
}

.day-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--space-2);
  margin: 0;
  font-size: 1rem;
}

.day-name {
  font-weight: 750;
  text-transform: capitalize;
}

.day-date {
  color: var(--color-text-muted);
  font-weight: 600;
}

.slots > li {
  min-width: 0;
}

.slots {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.free {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.free-time {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.nothing {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
</style>
