<script setup lang="ts">
import { effectiveIntervalHours, type Source } from '@pann/shared'
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
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AddRssForm from '../components/AddRssForm.vue'
import IntervalSelect from '../components/IntervalSelect.vue'
import TopicNav from '../components/TopicNav.vue'
import { api, type SourcePatch } from '../lib/api'
import { useTopicName } from '../lib/topic-name'

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
  onError: (err) => report(t('common.error', { message: err.message }), true),
})

const { mutate: requestCollection, isLoading: requesting } = useMutation({
  mutation: (source: Source) => api.requestCollection(props.topicId, source.id),
  async onSuccess(source) {
    report(t('sources.collectRequested', { label: source.label }))
    await queryCache.invalidateQueries({ key: ['sources', props.topicId] })
  },
  onError: (err) => report(t('common.error', { message: err.message }), true),
})

function collectionPending(source: Source): boolean {
  if (!source.run_requested_at) return false
  return !source.last_run_at || Date.parse(source.run_requested_at) > Date.parse(source.last_run_at)
}

const { mutate: remove } = useMutation({
  mutation: (source: Source) => api.deleteSource(props.topicId, source.id).then(() => source),
  async onSuccess(source) {
    report(t('sources.deleted', { label: source.label }))
    await queryCache.invalidateQueries({ key: ['sources', props.topicId] })
  },
  onError: (err) => report(t('common.error', { message: err.message }), true),
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

  <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <p v-else-if="!sources?.length">{{ t('sources.empty') }}</p>
  <div
    v-else
    class="table-wrapper"
    tabindex="0"
    role="region"
    :aria-label="t('sources.tableCaption')"
  >
    <table>
      <caption class="visually-hidden">
        {{
          t('sources.tableCaption')
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ t('sources.name') }}</th>
          <th scope="col">{{ t('sources.type') }}</th>
          <th scope="col">{{ t('sources.kind') }}</th>
          <th scope="col">{{ t('sources.frequency') }}</th>
          <th scope="col">{{ t('sources.lastRun') }}</th>
          <th scope="col">{{ t('sources.active') }}</th>
          <th scope="col">{{ t('sources.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="source in sources" :key="source.id">
          <th scope="row">
            <a
              v-if="feedUrl(source)"
              :href="feedUrl(source)"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ source.label }}
            </a>
            <template v-else>{{ source.label }}</template>
            <p v-if="source.last_error" class="hint error">
              {{ t('sources.lastError', { message: source.last_error }) }}
            </p>
          </th>
          <td>{{ t(`sourceType.${source.type}`) }}</td>
          <td>
            {{ source.default_kind ? t(`kind.${source.default_kind}`) : t('kindSelect.none') }}
          </td>
          <td>
            <IntervalSelect
              :model-value="source.interval_hours"
              :inherited-hours="inheritedHours(source)"
              :aria-label="t('sources.frequencyLabel', { label: source.label })"
              :disabled="updating"
              @update:model-value="(v) => update({ source, patch: { interval_hours: v } })"
            />
          </td>
          <td>
            {{
              source.last_run_at
                ? d(new Date(source.last_run_at), { dateStyle: 'short', timeStyle: 'short' })
                : t('common.never')
            }}
            <p v-if="collectionPending(source)" class="hint">{{ t('sources.pending') }}</p>
          </td>
          <td>
            <input
              type="checkbox"
              class="check"
              :checked="source.active"
              :aria-label="t('sources.activeLabel', { label: source.label })"
              :disabled="updating"
              @change="
                update({ source, patch: { active: ($event.target as HTMLInputElement).checked } })
              "
            />
          </td>
          <td class="row-actions">
            <button
              type="button"
              class="button"
              :aria-label="t('sources.collectLabel', { label: source.label })"
              :disabled="requesting || collectionPending(source) || !source.active"
              @click="requestCollection(source)"
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
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <p role="status" :class="{ error: isError }">{{ message }}</p>

  <AddRssForm v-if="topic" :topic-id="topicId" :config="topic.config" />
</template>

<style scoped>
.table-wrapper {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: start;
  vertical-align: middle;
}

thead th {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

tbody th {
  font-weight: 600;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.check {
  width: 1.5rem;
  height: 1.5rem;
  accent-color: var(--color-accent-text);
}
</style>
