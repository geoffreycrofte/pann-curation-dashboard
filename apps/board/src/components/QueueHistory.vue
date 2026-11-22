<script setup lang="ts">
import { dailySlots } from '@glimr/shared'
import { useQuery } from '@pinia/colada'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type QueueItem } from '../lib/api'
import { describeError } from '../lib/errors'
import { contentLangName } from '../lib/langs'

/** Embedded in the calendar; `only: 'recent'` shows what already went out (or failed). */
const props = defineProps<{ topicId: string; only?: 'recent' }>()
const { t, d } = useI18n()

const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const {
  data: queue,
  isPending,
  error,
} = useQuery({
  key: () => ['queue', props.topicId],
  query: () => api.queue(props.topicId),
})

const slots = computed(() => (topic.value ? dailySlots(topic.value.config.schedule) : []))
const isUpcoming = (item: QueueItem) => item.posts.some((p) => p.status === 'scheduled')
const upcoming = computed(() => (queue.value ?? []).filter(isUpcoming))
const recent = computed(() =>
  (queue.value ?? [])
    .filter((item) => !isUpcoming(item) && item.posts.some((p) => p.status !== 'scheduled'))
    .reverse(),
)
// Slots are set in the topic's time zone: dates are shown in it too.
const formatDate = (value: string) =>
  d(new Date(value), {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: topic.value?.config.schedule.timezone,
  })
</script>

<template>
  <template v-if="topic">
    <p v-if="slots.length">
      {{
        t('diffusion.queueSlots', {
          slots: slots.join(', '),
          timezone: topic.config.schedule.timezone,
        })
      }}
    </p>
    <p v-else>{{ t('diffusion.queuePaused') }}</p>
    <p class="hint">{{ t('diffusion.queueHint') }}</p>
  </template>

  <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <template v-else>
    <section
      v-for="group in [
        {
          id: 'upcoming',
          title: 'diffusion.upcoming',
          empty: 'diffusion.emptyUpcoming',
          items: upcoming,
        },
        { id: 'recent', title: 'diffusion.recent', empty: 'diffusion.emptyRecent', items: recent },
      ].filter((group) => !only || group.id === only)"
      :key="group.id"
      :aria-labelledby="`queue-${group.id}`"
      class="group"
    >
      <h2 :id="`queue-${group.id}`">{{ t(group.title) }}</h2>
      <p v-if="!group.items.length">{{ t(group.empty) }}</p>
      <ol v-else class="queue">
        <li v-for="item in group.items" :key="item.item_id" class="card entry">
          <p class="when">{{ formatDate(item.publish_at) }}</p>
          <h3 class="title">
            <RouterLink
              :to="{ name: 'item', params: { topicId, itemId: item.item_id } }"
              :lang="item.item.source_lang ?? undefined"
            >
              {{ item.item.title }}
            </RouterLink>
          </h3>
          <ul class="posts" :aria-label="t('diffusion.postsLabel', { title: item.item.title })">
            <li v-for="post in item.posts" :key="post.id" :data-status="post.status">
              {{
                t('diffusion.postLine', {
                  channel: t(`draft.channels.${post.channel}`),
                  lang: contentLangName(post.lang),
                  status: t(`diffusion.postStatus.${post.status}`),
                })
              }}
              <a
                v-if="post.published_url"
                :href="post.published_url"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="
                  t('diffusion.viewLabel', {
                    channel: t(`draft.channels.${post.channel}`),
                    lang: contentLangName(post.lang),
                  })
                "
                >{{ t('diffusion.view') }}</a
              >
              <span v-if="post.last_error && post.status === 'failed'" class="error">
                {{ describeError(post.last_error, t).text }}
              </span>
            </li>
          </ul>
        </li>
      </ol>
    </section>
  </template>
</template>

<style scoped>
.group {
  margin-top: var(--space-6);
}

.queue {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.entry {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
}

.entry p,
.entry h3 {
  margin: 0;
}

.when {
  font-weight: 700;
}

.title {
  font-size: 1.125rem;
}

.posts {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding-inline-start: var(--space-5);
  color: var(--color-text-muted);
}

.posts li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
}
</style>
