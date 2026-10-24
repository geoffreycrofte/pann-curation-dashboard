<script setup lang="ts">
import {
  effectiveIntervalHours,
  PROVIDER_INFO,
  PROVIDERS,
  requiredProvider,
  type Provider,
  type Source,
  type SourceRunStats,
} from '@pann/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger,
} from 'reka-ui'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AddRssForm from '../components/AddRssForm.vue'
import IntervalSelect from '../components/IntervalSelect.vue'
import TopicNav from '../components/TopicNav.vue'
import { api, type SourcePatch } from '../lib/api'
import { describeError } from '../lib/errors'
import { useTopicName } from '../lib/topic-name'
import { useWorkspace } from '../lib/workspace'

const props = defineProps<{ topicId: string }>()
const { t, d } = useI18n()
const queryCache = useQueryCache()
const topicName = useTopicName(() => props.topicId)

const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const {
  data: sources,
  isPending,
  error,
} = useQuery({
  key: () => ['sources', props.topicId],
  query: () => api.sources(props.topicId),
})

const message = ref('')
const isError = ref(false)
function report(text: string, error = false) {
  message.value = text
  isError.value = error
}

const { mutate: update, isLoading: updating } = useMutation({
  mutation: (vars: { source: Source; patch: SourcePatch }) =>
    api.updateSource(props.topicId, vars.source.id, vars.patch),
  async onSuccess(source) {
    report(t('sources.updated', { label: source.label }))
    await queryCache.invalidateQueries({ key: ['sources', props.topicId] })
  },
  onError: (err) => report(describeError(err.message, t).text, true),
})

function collectionPending(source: Source): boolean {
  if (!source.run_requested_at) return false
  return !source.last_run_at || Date.parse(source.run_requested_at) > Date.parse(source.last_run_at)
}

function formatStats(stats: SourceRunStats): string {
  return t('sources.stats', {
    added: stats.linked + stats.reopened,
    known: stats.known + stats.duplicates,
  })
}

// "Collect now": the API starts the job; we refresh until the source reports its run.
const POLL_MS = 2500
const POLL_LIMIT_MS = 120_000
const watched = new Map<string, number>()
let poller: ReturnType<typeof setInterval> | undefined

function stopPolling() {
  if (poller) clearInterval(poller)
  poller = undefined
}

function startPolling() {
  if (poller) return
  poller = setInterval(() => {
    const now = Date.now()
    for (const [id, startedAt] of watched) if (now - startedAt > POLL_LIMIT_MS) watched.delete(id)
    if (!watched.size) return stopPolling()
    void queryCache.invalidateQueries({ key: ['sources', props.topicId] })
  }, POLL_MS)
}
onBeforeUnmount(stopPolling)

watch(sources, (list) => {
  for (const source of list ?? []) {
    if (!watched.has(source.id) || collectionPending(source)) continue
    watched.delete(source.id)
    if (source.last_error) {
      report(
        t('sources.collectFailed', {
          label: source.label,
          error: describeError(source.last_error, t).text,
        }),
        true,
      )
    } else {
      report(
        t('sources.collectDone', {
          label: source.label,
          stats: source.last_run_stats ? formatStats(source.last_run_stats) : '',
        }),
      )
      void queryCache.invalidateQueries({ key: ['items', props.topicId] })
    }
  }
})

const { mutate: collectNow } = useMutation({
  mutation: (source: Source) => api.collectNow(props.topicId, source.id),
  async onSuccess(source) {
    report(t('sources.collectRequested', { label: source.label }))
    watched.set(source.id, Date.now())
    await queryCache.invalidateQueries({ key: ['sources', props.topicId] })
    startPolling()
  },
  onError: (err) => report(describeError(err.message, t).text, true),
})

// Keys the active sources need but the workspace does not have.
const { workspaceId } = useWorkspace()
const { data: credentials } = useQuery({
  key: () => ['credentials', workspaceId.value ?? ''],
  query: () => api.credentials(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})
const configured = computed(() => new Set(credentials.value?.map((c) => c.provider) ?? []))
const activeTypes = computed(
  () => new Set((sources.value ?? []).filter((s) => s.active).map((s) => s.type)),
)
const missingProviders = computed<Provider[]>(() =>
  PROVIDERS.filter((p) => {
    const type = PROVIDER_INFO[p].sourceType
    return (
      type &&
      requiredProvider(type) === p &&
      activeTypes.value.has(type) &&
      !configured.value.has(p)
    )
  }),
)
const githubWithoutToken = computed(
  () => !!credentials.value && activeTypes.value.has('github') && !configured.value.has('github'),
)

const { mutate: remove } = useMutation({
  mutation: (source: Source) => api.deleteSource(props.topicId, source.id).then(() => source),
  async onSuccess(source) {
    report(t('sources.deleted', { label: source.label }))
    await queryCache.invalidateQueries({ key: ['sources', props.topicId] })
  },
  onError: (err) => report(describeError(err.message, t).text, true),
})

function inheritedHours(source: Source): number | undefined {
  if (!topic.value) return undefined
  return effectiveIntervalHours({ ...source, interval_hours: null }, topic.value.config)
}

function feedUrl(source: Source): string | undefined {
  return source.type === 'rss' && typeof source.config.url === 'string'
    ? source.config.url
    : undefined
}
</script>

<template>
  <h1 tabindex="-1">{{ t('sources.heading', { topic: topicName }) }}</h1>
  <TopicNav :topic-id="topicId" />

  <div v-if="missingProviders.length || githubWithoutToken" class="notice" role="note">
    <p v-for="provider in missingProviders" :key="provider">
      {{
        t('sources.missingKey', {
          type: t(`sourceType.${PROVIDER_INFO[provider].sourceType}`),
          provider: t(`connections.providers.${provider}.name`),
        })
      }}
    </p>
    <p v-if="githubWithoutToken">{{ t('sources.githubNoToken') }}</p>
    <p>
      <RouterLink to="/connections">{{ t('errors.fixInConnections') }}</RouterLink>
    </p>
  </div>

  <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <p v-else-if="!sources?.length">{{ t('sources.empty') }}</p>
  <ul v-else class="sources" :aria-label="t('sources.tableCaption')">
    <li v-for="source in sources" :key="source.id">
      <article
        class="card source"
        :aria-labelledby="`source-${source.id}`"
        :data-active="source.active"
      >
        <div class="source-head">
          <div class="source-title">
            <h2 :id="`source-${source.id}`">
              <a
                v-if="feedUrl(source)"
                :href="feedUrl(source)"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ source.label }}
              </a>
              <template v-else>{{ source.label }}</template>
            </h2>
            <ul class="chips">
              <li class="chip chip-strong">{{ t(`sourceType.${source.type}`) }}</li>
              <li class="chip">
                {{ source.default_kind ? t(`kind.${source.default_kind}`) : t('kindSelect.none') }}
              </li>
            </ul>
          </div>
          <div class="source-run">
            <p class="run-date">
              <span class="hint">{{ t('sources.lastRun') }}</span>
              {{
                source.last_run_at
                  ? d(new Date(source.last_run_at), { dateStyle: 'short', timeStyle: 'short' })
                  : t('common.never')
              }}
            </p>
            <p v-if="collectionPending(source)" class="hint">{{ t('sources.pending') }}</p>
            <p v-else-if="source.last_run_stats" class="hint">
              {{ formatStats(source.last_run_stats) }}
            </p>
          </div>
        </div>

        <p v-if="source.last_error" class="error source-error">
          {{ t('sources.lastError', { message: describeError(source.last_error, t).text }) }}
          <RouterLink v-if="describeError(source.last_error, t).provider" to="/connections">
            {{ t('errors.fixInConnections') }}
          </RouterLink>
        </p>

        <div class="source-controls">
          <div class="form-row">
            <label :for="`freq-${source.id}`" class="hint">{{ t('sources.frequency') }}</label>
            <IntervalSelect
              :id="`freq-${source.id}`"
              :model-value="source.interval_hours"
              :inherited-hours="inheritedHours(source)"
              :disabled="updating"
              @update:model-value="(v) => update({ source, patch: { interval_hours: v } })"
            />
          </div>
          <div class="form-check active-check">
            <input
              :id="`active-${source.id}`"
              type="checkbox"
              :checked="source.active"
              :disabled="updating"
              @change="
                update({ source, patch: { active: ($event.target as HTMLInputElement).checked } })
              "
            />
            <label :for="`active-${source.id}`">{{ t('sources.activeShort') }}</label>
          </div>
          <div class="row-actions">
            <button
              type="button"
              class="button"
              data-variant="primary"
              :aria-label="t('sources.collectLabel', { label: source.label })"
              :disabled="collectionPending(source) || !source.active"
              @click="collectNow(source)"
            >
              {{ t('sources.collect') }}
            </button>
            <AlertDialogRoot>
              <AlertDialogTrigger as-child>
                <button
                  type="button"
                  class="button"
                  :aria-label="t('sources.deleteLabel', { label: source.label })"
                >
                  {{ t('common.delete') }}
                </button>
              </AlertDialogTrigger>
              <AlertDialogPortal>
                <AlertDialogOverlay class="dialog-overlay" />
                <AlertDialogContent class="dialog">
                  <AlertDialogTitle class="dialog-title">
                    {{ t('sources.confirmTitle', { label: source.label }) }}
                  </AlertDialogTitle>
                  <AlertDialogDescription>{{ t('sources.confirmText') }}</AlertDialogDescription>
                  <div class="dialog-actions">
                    <AlertDialogCancel class="button">{{ t('common.cancel') }}</AlertDialogCancel>
                    <AlertDialogAction class="button" data-variant="danger" @click="remove(source)">
                      {{ t('common.delete') }}
                    </AlertDialogAction>
                  </div>
                </AlertDialogContent>
              </AlertDialogPortal>
            </AlertDialogRoot>
          </div>
        </div>
      </article>
    </li>
  </ul>
  <p role="status" :class="{ error: isError }">{{ message }}</p>

  <AddRssForm v-if="topic" :topic-id="topicId" :config="topic.config" />
</template>

<style scoped>
.sources {
  display: grid;
  gap: var(--space-4);
  margin: 0 0 var(--space-6);
  padding: 0;
  list-style: none;
}

.source {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-6);
}

.source[data-active='false'] {
  background: var(--color-surface-2);
}

.source-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-3) var(--space-6);
}

.source-title {
  display: grid;
  gap: var(--space-2);
}

.source-title h2 {
  margin: 0;
  font-size: 1.25rem;
}

.source-title h2 a {
  color: var(--color-text);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.chip {
  padding: 0.125rem var(--space-3);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-pill);
  background: var(--color-surface-2);
  font-size: 0.8125rem;
  font-weight: 650;
}

.chip-strong {
  border-color: var(--color-text);
}

.source-run {
  text-align: end;
}

.source-run p {
  margin: 0;
}

.run-date {
  display: grid;
  font-weight: 650;
}

.source-error {
  margin: 0;
}

.source-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--space-4) var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
}

.active-check {
  min-height: 2.75rem;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-inline-start: auto;
}

@media (max-width: 40rem) {
  .source-run {
    text-align: start;
  }

  .row-actions {
    margin-inline-start: 0;
  }
}
</style>
