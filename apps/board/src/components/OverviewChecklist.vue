<script setup lang="ts">
/**
 * Setup checklist of a topic, on its overview. Every line is derived from the real state
 * (keys, sources, accounts, items sorted…), never ticked by hand, so it cannot lie. It
 * can be folded (per topic, in this browser); folded, a one-line summary stays.
 */
import { newsletterReady } from '@glimr/shared'
import { useQuery } from '@pinia/colada'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RouteLocationRaw } from 'vue-router'
import { api } from '../lib/api'
import Icon, { type IconName } from './Icon.vue'
import { useTopicSummary } from '../lib/topic-summary'
import { useWorkspace } from '../lib/workspace'

const props = defineProps<{ topicId: string }>()
const { t } = useI18n()
const id = useId()
const { workspaceId } = useWorkspace()
const { topic, modules } = useTopicSummary(() => props.topicId)

const { data: credentials } = useQuery({
  key: () => ['credentials', workspaceId.value ?? ''],
  query: () => api.credentials(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})
const { data: sources } = useQuery({
  key: () => ['sources', props.topicId, 'curation'],
  query: () => api.sources(props.topicId, 'curation'),
  enabled: () => !!modules.value?.curation,
})
const { data: curationCounts } = useQuery({
  key: () => ['items', props.topicId, 'counts'],
  query: () => api.counts(props.topicId),
  enabled: () => !!modules.value?.curation,
})
const { data: engagementCounts } = useQuery({
  key: () => ['conversations', props.topicId, 'counts'],
  query: () => api.counts(props.topicId, 'engagement'),
  enabled: () => !!modules.value?.engagement,
})
const { data: compositions } = useQuery({
  key: () => ['compositions', props.topicId],
  query: () => api.compositions(props.topicId),
  enabled: () => !!modules.value?.compose,
})
const { data: queue } = useQuery({
  key: () => ['queue', props.topicId],
  query: () => api.queue(props.topicId),
})

interface Line {
  key: string
  label: string
  done: boolean
  to: RouteLocationRaw
  action: string
  icon: IconName
}

const settings = (tab: string): RouteLocationRaw => ({
  name: 'settings',
  params: { topicId: props.topicId },
  query: { tab },
})

const lines = computed<Line[]>(() => {
  const config = topic.value?.config
  if (!config) return []
  const sorted = (['validated', 'rejected', 'published', 'archived'] as const).reduce(
    (sum, s) => sum + (curationCounts.value?.[s] ?? 0),
    0,
  )
  const list: Line[] = [
    {
      key: 'ai',
      label: t('checklist.ai'),
      done: !!credentials.value?.some((c) => c.provider === 'anthropic' && c.status !== 'invalid'),
      to: '/connections',
      action: t('checklist.connect'),
      icon: 'sparkles',
    },
  ]
  if (config.modules.curation) {
    list.push({
      key: 'sources',
      label: t('checklist.sources'),
      done: !!sources.value?.length,
      to: settings('sources'),
      action: t('checklist.addSources'),
      icon: 'rss',
    })
    // A line per network aimed at during onboarding, done once an account publishes it.
    for (const channel of config.target_channels)
      list.push({
        key: `network-${channel}`,
        label: t('checklist.network', { network: t(`draft.channels.${channel}`) }),
        done: config.channels.some((c) => c.channel === channel),
        to: settings('publishing'),
        action: t('checklist.choose'),
        icon: channel,
      })
    if (config.target_newsletter)
      list.push({
        key: 'newsletter',
        label: t('checklist.newsletter'),
        done: newsletterReady(config),
        to: settings('newsletter'),
        action: t('checklist.setUp'),
        icon: 'mail',
      })
    list.push(
      {
        key: 'sort',
        label: t('checklist.sort'),
        done: sorted >= 10,
        to: { name: 'board', params: { topicId: props.topicId } },
        action: t('checklist.openWatch'),
        icon: 'list-check',
      },
      {
        key: 'schedule',
        label: t('checklist.schedule'),
        done: !!queue.value?.length,
        to: {
          name: 'board',
          params: { topicId: props.topicId },
          query: { status: 'validated' },
        },
        action: t('checklist.openValidated'),
        icon: 'calendar',
      },
    )
  }
  if (config.modules.compose)
    list.push({
      key: 'compose',
      label: t('checklist.compose'),
      done: !!compositions.value?.length,
      to: { name: 'compose', params: { topicId: props.topicId } },
      action: t('checklist.openCompose'),
      icon: 'writing',
    })
  if (config.modules.engagement)
    list.push({
      key: 'conversations',
      label: t('checklist.conversations'),
      done: (engagementCounts.value?.validated ?? 0) + (engagementCounts.value?.rejected ?? 0) > 0,
      to: { name: 'engagement', params: { topicId: props.topicId } },
      action: t('checklist.openConversations'),
      icon: 'messages',
    })
  return list
})
const doneCount = computed(() => lines.value.filter((l) => l.done).length)
const allDone = computed(() => lines.value.length > 0 && doneCount.value === lines.value.length)

// Folded or not, per topic, in this browser only (a convenience, not a setting).
const storageKey = () => `glimr.checklist.${props.topicId}`
const folded = ref(false)
watch(
  () => props.topicId,
  () => {
    try {
      folded.value = localStorage.getItem(storageKey()) === 'folded'
    } catch {
      folded.value = false
    }
  },
  { immediate: true },
)
function setFolded(value: boolean) {
  folded.value = value
  try {
    if (value) localStorage.setItem(storageKey(), 'folded')
    else localStorage.removeItem(storageKey())
  } catch {
    // storage unavailable: folded until the page is left
  }
}
</script>

<template>
  <section v-if="lines.length && !allDone" class="checklist" :aria-labelledby="`${id}-title`">
    <div class="head">
      <h2 :id="`${id}-title`">{{ t('checklist.title') }}</h2>
      <p class="progress">
        {{ t('checklist.progress', { done: doneCount, total: lines.length }) }}
      </p>
      <button
        type="button"
        class="button"
        data-size="small"
        :aria-expanded="!folded"
        :aria-controls="`${id}-list`"
        @click="setFolded(!folded)"
      >
        {{ folded ? t('checklist.show') : t('checklist.hide') }}
      </button>
    </div>
    <ol v-show="!folded" :id="`${id}-list`" class="lines">
      <li v-for="line in lines" :key="line.key" :data-done="line.done || undefined">
        <span class="mark" aria-hidden="true">{{ line.done ? '✓' : '' }}</span>
        <span :id="`${id}-${line.key}`" class="label">
          <span class="visually-hidden">{{
            line.done ? t('checklist.done') : t('checklist.todo')
          }}</span>
          {{ line.label }}
        </span>
        <!-- Several lines share an action word ("Choose the account"): the line's label
             describes which one. -->
        <RouterLink
          v-if="!line.done"
          :to="line.to"
          class="button"
          data-size="small"
          :aria-describedby="`${id}-${line.key}`"
        >
          <Icon :name="line.icon" :size="16" />
          {{ line.action }}
        </RouterLink>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.checklist {
  display: grid;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--color-border-subtle);
  border-inline-start: 6px solid var(--color-accent-fill);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4);
}

.head h2 {
  margin: 0;
  font-size: 1.25rem;
}

.progress {
  flex: 1;
  margin: 0;
  color: var(--color-text-muted);
}

.lines {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.lines li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  min-height: 2.75rem;
}

.mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border: 1.5px solid var(--color-border);
  border-radius: 50%;
  font-size: 0.875rem;
  font-weight: 700;
}

[data-done] .mark {
  border-color: var(--color-success);
  background: var(--color-success-soft);
  color: var(--color-success);
}

[data-done] .label {
  color: var(--color-text-muted);
}

.label {
  flex: 1;
}
</style>
