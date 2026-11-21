<script setup lang="ts">
/**
 * What runs for this topic, said plainly from the real state (sources, AI key, accounts),
 * and the switch to pause it or resume it. Paused: nothing is collected, sorted, drafted
 * by itself or published; scheduled posts wait and go out once the topic is resumed.
 */
import { backlogLimitOf, isBacklogFull } from '@pann/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../lib/api'
import { describeError } from '../../lib/errors'
import { toast } from '../../lib/toast'
import { useWorkspace } from '../../lib/workspace'
import Icon from '../Icon.vue'

const props = defineProps<{ topicId: string }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()
const { workspaceId } = useWorkspace()

const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const modules = computed(() => topic.value?.config.modules)
const { data: credentials } = useQuery({
  key: () => ['credentials', workspaceId.value ?? ''],
  query: () => api.credentials(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})
const { data: curationSources } = useQuery({
  key: () => ['sources', props.topicId, 'curation'],
  query: () => api.sources(props.topicId, 'curation'),
  enabled: () => !!modules.value?.curation,
})
const { data: engagementSources } = useQuery({
  key: () => ['sources', props.topicId, 'engagement'],
  query: () => api.sources(props.topicId, 'engagement'),
  enabled: () => !!modules.value?.engagement,
})

// Same keys as the lists: one fetch, refreshed together.
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
/** Collection of a tool waiting, as too much is left to sort (`pause_above`). */
function waiting(module: 'curation' | 'engagement') {
  const config = topic.value?.config
  const toSort = (module === 'curation' ? curationCounts : engagementCounts).value?.new
  if (!config || toSort === undefined) return null
  const limit = backlogLimitOf(config, module)
  return isBacklogFull(toSort, limit) ? { count: toSort, limit } : null
}

const active = computed(() => topic.value?.active !== false)
const aiKey = computed(() => credentials.value?.find((c) => c.provider === 'anthropic'))
const hasAi = computed(() => !!aiKey.value && aiKey.value.status !== 'invalid')
const publishes = computed(() => !!modules.value?.curation || !!modules.value?.compose)

/** ok: runs; off: not set up, so not running; warn: runs, but at risk or held back. */
type Tone = 'ok' | 'off' | 'warn'
interface Line {
  key: string
  icon: string
  tone: Tone
  text: string
}
const TONE_ICON: Record<Tone, string> = { ok: 'check', off: 'minus', warn: 'exclamation' }
const lines = computed<Line[]>(() => {
  const config = topic.value?.config
  if (!config) return []
  const list: Line[] = []
  if (config.modules.curation) {
    const n = (curationSources.value ?? []).filter((s) => s.active).length
    const wait = n ? waiting('curation') : null
    list.push({
      key: 'collect',
      icon: 'rss',
      tone: wait ? 'warn' : n > 0 ? 'ok' : 'off',
      text: wait
        ? t('topicStatus.collectWaiting', wait)
        : n
          ? t('topicStatus.collect', n)
          : t('topicStatus.noSources'),
    })
  }
  if (config.modules.engagement) {
    const n = (engagementSources.value ?? []).filter((s) => s.active).length
    const wait = n ? waiting('engagement') : null
    list.push({
      key: 'listen',
      icon: 'messages',
      tone: wait ? 'warn' : n > 0 ? 'ok' : 'off',
      text: wait
        ? t('topicStatus.listenWaiting', wait)
        : n
          ? t('topicStatus.listen', n)
          : t('topicStatus.noSearches'),
    })
  }
  list.push({
    key: 'ai',
    icon: 'sparkles',
    // A key the provider rejected: set up, but nothing is sorted any more.
    tone: hasAi.value ? 'ok' : aiKey.value ? 'warn' : 'off',
    text: hasAi.value
      ? t('topicStatus.ai')
      : aiKey.value
        ? t('topicStatus.aiInvalid')
        : t('topicStatus.noAi'),
  })
  if (publishes.value) {
    const n = config.channels.length
    list.push({
      key: 'publish',
      icon: 'send',
      tone: n > 0 ? 'ok' : 'off',
      text: n ? t('topicStatus.publish', n) : t('topicStatus.noAccounts'),
    })
  }
  return list
})

const { mutate, isLoading } = useMutation({
  mutation: (next: boolean) => api.updateTopic(props.topicId, { active: next }),
  async onSuccess(_data, next) {
    toast(next ? t('topicStatus.resumed') : t('topicStatus.paused'))
    await queryCache.invalidateQueries({ key: ['topic', props.topicId] })
    await queryCache.invalidateQueries({ key: ['topics'] })
  },
  onError(err) {
    toast(describeError(err.message, t).text)
  },
})
</script>

<template>
  <section
    v-if="topic"
    class="status card"
    :data-active="active || undefined"
    :aria-labelledby="`${id}-title`"
  >
    <h2 :id="`${id}-title`">
      <span class="dot" aria-hidden="true"></span>
      {{ active ? t('topicStatus.running') : t('topicStatus.pausedTitle') }}
    </h2>
    <ul v-if="active" class="lines">
      <li v-for="line in lines" :key="line.key" :data-tone="line.tone">
        <!-- Colour and shape both say the state; the hidden label says it in words. -->
        <span class="state" aria-hidden="true">
          <Icon :name="TONE_ICON[line.tone]" :size="14" />
        </span>
        <span class="visually-hidden">{{ t(`topicStatus.${line.tone}Label`) }}</span>
        <Icon :name="line.icon" class="kind" />
        <span>{{ line.text }}</span>
      </li>
    </ul>
    <!-- The switch comes after the state it changes, its effect beside it: quiet while
         the topic runs, the main thing to read once it is paused. -->
    <div class="switch">
      <button
        type="button"
        class="button"
        data-size="small"
        :disabled="isLoading"
        :aria-describedby="`${id}-effect`"
        @click="mutate(!active)"
      >
        <Icon :name="active ? 'player-pause' : 'player-play'" />
        {{ active ? t('topicStatus.pause') : t('topicStatus.resume') }}
      </button>
      <p :id="`${id}-effect`" class="hint">
        {{ active ? t('topicStatus.pauseEffect') : t('topicStatus.resumeEffect') }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.status {
  display: grid;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
  padding: var(--space-4) var(--space-5);
}

.status h2 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: 1.25rem;
}

.dot {
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid var(--color-text-muted);
  border-radius: 50%;
}

[data-active] .dot {
  border-color: var(--color-success);
  background: var(--color-success);
}

.switch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4);
  margin-top: var(--space-1);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border-subtle);
}

.switch .button {
  flex: none;
}

.switch .hint {
  flex: 1 1 20rem;
  margin: 0;
  font-size: 0.875rem;
}

/* Paused: the effect of resuming is what matters now, at full size. */
.status:not([data-active]) .switch .hint {
  font-size: 1rem;
  color: var(--color-text);
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
  align-items: center;
  gap: var(--space-2);
}

/* A filled disc per state: green runs, grey is off, orange needs a look. */
.state {
  display: grid;
  flex: none;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
}

.state :deep(svg) {
  stroke-width: 3;
}

[data-tone='ok'] .state {
  background: var(--color-success-fill);
  color: var(--color-on-success);
}

[data-tone='off'] .state {
  background: var(--color-neutral-fill);
  color: var(--color-on-neutral);
}

[data-tone='warn'] .state {
  background: var(--color-warning);
  color: var(--color-on-warning);
}

[data-tone='warn'] {
  font-weight: 600;
}

@media (forced-colors: active) {
  .state {
    border: 1px solid CanvasText;
  }
}

.kind {
  color: var(--color-text-muted);
}
</style>
