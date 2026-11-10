<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { QueueItem } from '../lib/api'
import { describeError } from '../lib/errors'

const props = defineProps<{
  topicId: string
  entry: QueueItem
  /** Time of the slot, in the time zone of the topic (HH:MM). */
  time: string
  /** Compact: in a column of the week planning. */
  compact?: boolean
}>()
const { t } = useI18n()

const TONES = { scheduled: 'accent', sent: 'success', failed: 'danger' } as const
const failed = computed(() => props.entry.posts.filter((p) => p.status === 'failed'))
</script>

<template>
  <article class="card entry" :data-compact="compact || undefined">
    <p class="time">
      <time :datetime="entry.publish_at">{{ time }}</time>
    </p>
    <h4 class="title">
      <RouterLink
        :to="{ name: 'item', params: { topicId, itemId: entry.item_id } }"
        :lang="entry.item.source_lang ?? undefined"
      >
        {{ entry.item.title }}
      </RouterLink>
    </h4>
    <ul
      v-if="entry.posts.length"
      class="badges"
      :aria-label="t('diffusion.postsLabel', { title: entry.item.title })"
    >
      <li
        v-for="post in entry.posts"
        :key="post.id"
        class="badge"
        data-dot
        :data-tone="TONES[post.status as keyof typeof TONES]"
      >
        <span
          >{{ t(`draft.channels.${post.channel}`) }}
          <abbr v-if="post.lang" :title="t(`draft.langs.${post.lang}`)">{{
            post.lang.toUpperCase()
          }}</abbr
          ><span :class="{ 'visually-hidden': post.status === 'scheduled' }">{{
            t('scheduled.postStatus', { status: t(`diffusion.postStatus.${post.status}`) })
          }}</span></span
        >
        <a
          v-if="post.published_url"
          :href="post.published_url"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="
            t('diffusion.viewLabel', {
              channel: t(`draft.channels.${post.channel}`),
              lang: t(`draft.langs.${post.lang}`),
            })
          "
          >{{ t('scheduled.view') }}</a
        >
      </li>
    </ul>
    <p v-for="post in failed" :key="post.id" class="error">
      {{ describeError(post.last_error ?? '', t).text }}
    </p>
  </article>
</template>

<style scoped>
.entry {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-3) var(--space-4);
}

.entry p,
.entry h4 {
  margin: 0;
}

.time {
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.title {
  font-size: 1rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.entry[data-compact] {
  padding: var(--space-2) var(--space-3);
}

.entry[data-compact] .title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  font-size: 0.9375rem;
}

/* In a column of the planning: badges and errors wrap instead of overflowing. */
.entry[data-compact] .badge {
  flex-wrap: wrap;
  max-width: 100%;
}

.entry[data-compact] .error {
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}

.badge abbr {
  text-decoration: none;
}

.error {
  font-size: 0.875rem;
}
</style>
