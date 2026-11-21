<script setup lang="ts">
/**
 * Empty state of the lists to sort (curation, engagement): rather than an empty page,
 * collect every active source of the tool now. One collection at a time (the button is
 * disabled while one runs, including one started elsewhere), as a collection can cost
 * (Exa searches, sorting by AI). Without sources it leads to them; paused, to the overview.
 * Outcomes are announced through the list's live region (`announce`): once items arrive,
 * this empty state is gone.
 */
import type { Source, TopicModule } from '@pann/shared'
import { useQuery, useQueryCache } from '@pinia/colada'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { useTopicSummary } from '../lib/topic-summary'
import Icon from './Icon.vue'

const props = defineProps<{
  topicId: string
  module: Extract<TopicModule, 'curation' | 'engagement'>
}>()
const emit = defineEmits<{ announce: [message: string] }>()
const { t } = useI18n()
const queryCache = useQueryCache()
const { topic } = useTopicSummary(() => props.topicId)

const { data: sources, isPending } = useQuery({
  key: () => ['sources', props.topicId, props.module],
  query: () => api.sources(props.topicId, props.module),
})
const active = computed(() => (sources.value ?? []).filter((s) => s.active))
/** The sources of this tool: its own sub-tab in the settings (conversations apart). */
const sourcesLink = computed(() => ({
  name: 'settings',
  params: { topicId: props.topicId },
  query: { tab: 'sources', ...(props.module === 'engagement' ? { sub: 'conversations' } : {}) },
}))
const paused = computed(() => topic.value?.active === false)

function pending(source: Source): boolean {
  if (!source.run_requested_at) return false
  return !source.last_run_at || Date.parse(source.run_requested_at) > Date.parse(source.last_run_at)
}
const starting = ref(false)
const running = computed(() => starting.value || active.value.some(pending))

const POLL_MS = 2500
const POLL_LIMIT_MS = 120_000
/** Shown under the text; also announced. */
const message = ref('')
let startedAt = 0
let watching = false
let poller: ReturnType<typeof setInterval> | undefined

function stop() {
  clearInterval(poller)
  poller = undefined
}
function poll() {
  if (poller) return
  poller = setInterval(() => {
    if (Date.now() - startedAt > POLL_LIMIT_MS) {
      stop()
      watching = false
      say(t('collect.slow'))
      return
    }
    void queryCache.invalidateQueries({ key: ['sources', props.topicId, props.module] })
  }, POLL_MS)
}
onBeforeUnmount(stop)

function say(text: string) {
  message.value = text
  emit('announce', text)
}

async function run() {
  if (running.value || !active.value.length) return
  starting.value = true
  message.value = ''
  try {
    await Promise.all(active.value.map((s) => api.collectNow(props.topicId, s.id)))
    startedAt = Date.now()
    watching = true
    say(t('collect.running'))
    await queryCache.invalidateQueries({ key: ['sources', props.topicId, props.module] })
    poll()
  } catch {
    say(t('collect.failedToStart'))
  } finally {
    starting.value = false
  }
}

// A collection started elsewhere (settings, the overview after creation): follow it too.
watch(
  active,
  async (list) => {
    if (list.some(pending)) {
      if (!watching) {
        watching = true
        startedAt = Date.now()
      }
      return poll()
    }
    if (!watching) return
    watching = false
    stop()
    // The run that served the request (server clocks on both sides).
    const served = list.filter(
      (s) =>
        s.run_requested_at &&
        s.last_run_at &&
        Date.parse(s.last_run_at) >= Date.parse(s.run_requested_at),
    )
    const added = served.reduce(
      (sum, s) =>
        sum + (s.last_run_stats ? s.last_run_stats.linked + s.last_run_stats.reopened : 0),
      0,
    )
    const failed = served.filter((s) => s.last_error).length
    const key = props.module === 'curation' ? 'items' : 'conversations'
    say(
      failed
        ? t('collect.doneWithErrors', { failed }, failed)
        : t(`collect.done.${props.module}`, { count: added }, added),
    )
    await queryCache.invalidateQueries({ key: [key, props.topicId] })
  },
  { immediate: true },
)
</script>

<template>
  <div class="collect">
    <p v-if="isPending">{{ t('board.loading') }}</p>
    <template v-else-if="paused">
      <p>{{ t('collect.paused') }}</p>
      <RouterLink class="button" data-size="small" :to="{ name: 'overview', params: { topicId } }">
        <Icon name="player-play" :size="16" />
        {{ t('collect.toOverview') }}
      </RouterLink>
    </template>
    <template v-else-if="!active.length">
      <p>{{ t(`collect.noSources.${module}`) }}</p>
      <RouterLink class="button" data-size="small" :to="sourcesLink">
        <Icon name="plus" :size="16" />
        {{ t('collect.addSources') }}
      </RouterLink>
    </template>
    <template v-else>
      <p>{{ t(`collect.empty.${module}`) }}</p>
      <div class="actions">
        <button
          type="button"
          class="button"
          data-variant="primary"
          :aria-disabled="running || undefined"
          @click="run"
        >
          <Icon name="refresh" :size="16" />
          {{ running ? t('collect.running') : t('collect.run') }}
        </button>
        <RouterLink :to="sourcesLink">{{ t('collect.manageSources') }}</RouterLink>
      </div>
      <!-- Announced by the list (live region); shown here for everyone. -->
      <p v-if="message && !running" class="hint">{{ message }}</p>
    </template>
  </div>
</template>

<style scoped>
.collect {
  display: grid;
  justify-items: start;
  gap: var(--space-3);
  padding: var(--space-5);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.collect p {
  margin: 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3) var(--space-5);
}
</style>
