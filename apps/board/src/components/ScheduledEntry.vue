<script setup lang="ts">
import { useMutation, useQueryCache } from '@pinia/colada'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type CompositionSummary, type QueueItem } from '../lib/api'
import { describeError } from '../lib/errors'
import { toast } from '../lib/toast'
import { contentLangName } from '../lib/langs'
import Icon from './Icon.vue'

/**
 * One scheduled post in the Calendar: an item of the news watch (gold edge, its posts per
 * network) or a post of Création (violet edge). The tool is also written next to the time.
 */
const props = defineProps<{
  topicId: string
  /** An item of the news watch, or else… */
  entry?: QueueItem
  /** …a post of Création. */
  composition?: CompositionSummary
  /** Time of the slot, in the time zone of the topic (HH:MM). */
  time: string
  /** Compact: in a column of the week planning. */
  compact?: boolean
  /** Direct control: the item can be taken out of the queue from here. */
  controls?: boolean
}>()
const { t } = useI18n()
const queryCache = useQueryCache()

// Back to the validated items, its posts drafts again (same as on its page).
const waiting = computed(() => !!props.entry?.posts.some((p) => p.status === 'scheduled'))
const {
  mutate: unschedule,
  isLoading: unscheduling,
  error: unscheduleError,
} = useMutation({
  mutation: () => api.unschedule(props.topicId, props.entry!.item_id),
  async onSuccess() {
    toast(t('diffusion.unscheduled'))
    await queryCache.invalidateQueries({ key: ['queue', props.topicId] })
    await queryCache.invalidateQueries({ key: ['items', props.topicId] })
  },
})

const TONES = { scheduled: 'accent', sent: 'success', failed: 'danger' } as const
const failed = computed(() => props.entry?.posts.filter((p) => p.status === 'failed') ?? [])
const at = computed(() => props.entry?.publish_at ?? props.composition?.publish_at ?? '')
</script>

<template>
  <article
    class="card entry"
    :data-kind="composition ? 'creation' : 'publication'"
    :data-compact="compact || undefined"
  >
    <p class="time">
      <Icon :name="composition ? 'writing' : 'news'" :size="16" class="kind" />
      <time :datetime="at">{{ time }}</time>
      <span class="tool">{{ composition ? t('nav.compose') : t('nav.curation') }}</span>
    </p>
    <h4 v-if="composition" class="title">
      <RouterLink :to="{ name: 'composition', params: { topicId, compositionId: composition.id } }">
        {{ composition.subject || t('compose.untitled') }}
      </RouterLink>
    </h4>
    <h4 v-else-if="entry" class="title">
      <RouterLink
        :to="{ name: 'item', params: { topicId, itemId: entry.item_id } }"
        :lang="entry.item.source_lang ?? undefined"
      >
        {{ entry.item.title }}
      </RouterLink>
    </h4>
    <ul
      v-if="entry?.posts.length"
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
          <abbr v-if="post.lang" :title="contentLangName(post.lang)">{{
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
              lang: contentLangName(post.lang),
            })
          "
          >{{ t('scheduled.view') }}</a
        >
      </li>
    </ul>
    <p v-for="post in failed" :key="post.id" class="notice notice-inline" data-tone="danger">
      <Icon name="alert-circle" />
      <span>{{ describeError(post.last_error ?? '', t).text }}</span>
    </p>
    <div v-if="controls && entry && waiting && !compact" class="entry-actions">
      <button
        type="button"
        class="button"
        data-size="small"
        :disabled="unscheduling"
        @click="unschedule()"
      >
        {{ t('diffusion.unschedule')
        }}<span class="visually-hidden">{{ t('scheduled.of', { title: entry.item.title }) }}</span>
      </button>
    </div>
    <p v-if="unscheduleError" class="notice notice-inline" data-tone="danger" role="alert">
      <Icon name="alert-circle" />
      <span>{{ describeError(unscheduleError.message, t).text }}</span>
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

.entry {
  border-inline-start: 4px solid var(--color-kind-publication);
}

.entry[data-kind='creation'] {
  border-inline-start-color: var(--color-kind-creation);
}

.time {
  display: flex;
  align-items: center;
  gap: var(--space-2);
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

.entry[data-compact] .notice {
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}

.kind {
  color: var(--color-kind-publication);
}

.entry[data-kind='creation'] .kind {
  color: var(--color-kind-creation);
}

/* The tool, quiet after the time: the edge color is never the only sign. */
.tool {
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.badge abbr {
  text-decoration: none;
}

.entry-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
