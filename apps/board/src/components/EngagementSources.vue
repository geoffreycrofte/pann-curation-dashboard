<script setup lang="ts">
import { ENGAGEMENT_SOURCE_TYPES, type EngagementSourceType, type Source } from '@pann/shared'
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
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'

/** Where the engagement tool looks for conversations: Hacker News and Bluesky searches. */
const props = defineProps<{ topicId: string }>()
const { t, d } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const key = () => ['sources', props.topicId, 'engagement']
const {
  data: sources,
  isPending,
  error,
} = useQuery({
  key,
  query: () => api.sources(props.topicId, 'engagement'),
})

const message = ref('')
const isError = ref(false)
function report(text: string, failed = false) {
  message.value = text
  isError.value = failed
}
async function refresh() {
  await queryCache.invalidateQueries({ key: ['sources', props.topicId] })
}

const { mutate: update, isLoading: updating } = useMutation({
  mutation: (vars: { source: Source; active: boolean }) =>
    api.updateSource(props.topicId, vars.source.id, { active: vars.active }),
  async onSuccess(source) {
    report(t('sources.updated', { label: source.label }))
    await refresh()
  },
  onError: (err) => report(describeError(err.message, t).text, true),
})

// "Collect now" runs a job: refresh the sources and conversations a little later.
const { mutate: collectNow } = useMutation({
  mutation: (source: Source) => api.collectNow(props.topicId, source.id),
  async onSuccess(source) {
    report(t('sources.collectRequested', { label: source.label }))
    await refresh()
    setTimeout(async () => {
      await refresh()
      await queryCache.invalidateQueries({ key: ['conversations', props.topicId] })
    }, 8000)
  },
  onError: (err) => report(describeError(err.message, t).text, true),
})

const { mutate: remove } = useMutation({
  mutation: (source: Source) => api.deleteSource(props.topicId, source.id).then(() => source),
  async onSuccess(source) {
    report(t('sources.deleted', { label: source.label }))
    await refresh()
  },
  onError: (err) => report(describeError(err.message, t).text, true),
})

// ---------------------------------------------------------------------------
// Add a search
// ---------------------------------------------------------------------------
const type = ref<EngagementSourceType>('hackernews')
const label = ref('')
const query = ref('')
const scope = ref<'stories' | 'comments' | 'all'>('all')
const minPoints = ref(0)
const lang = ref('')
const maxResults = ref(20)

const { mutate: add, isLoading: adding } = useMutation({
  mutation: () =>
    api.addSearchSource(props.topicId, {
      type: type.value,
      label: label.value,
      config:
        type.value === 'hackernews'
          ? {
              query: query.value,
              scope: scope.value,
              min_points: minPoints.value,
              max_results: maxResults.value,
            }
          : {
              query: query.value,
              max_results: maxResults.value,
              ...(lang.value ? { lang: lang.value } : {}),
            },
      default_kind: null,
      interval_hours: null,
    }),
  async onSuccess(source) {
    report(t('searchSource.created', { label: source.label }))
    label.value = ''
    query.value = ''
    await refresh()
  },
  onError: (err) => report(describeError(err.message, t).text, true),
})

const queryOf = (source: Source) =>
  typeof source.config.query === 'string' ? source.config.query : ''
</script>

<template>
  <section class="engagement-sources" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`">{{ t('engagement.sources.title') }}</h2>
    <p class="hint">{{ t('engagement.sources.intro') }}</p>

    <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
    <p v-else-if="!sources?.length">{{ t('engagement.sources.empty') }}</p>
    <ul v-else class="sources">
      <li
        v-for="source in sources"
        :key="source.id"
        class="card source"
        :data-active="source.active"
      >
        <div class="head">
          <h3>{{ source.label }}</h3>
          <span class="badge">{{ t(`sourceType.${source.type}`) }}</span>
        </div>
        <p class="query">{{ queryOf(source) }}</p>
        <p class="hint">
          {{
            t('engagement.sources.lastRun', {
              date: source.last_run_at
                ? d(new Date(source.last_run_at), { dateStyle: 'short', timeStyle: 'short' })
                : t('common.never'),
            })
          }}
        </p>
        <p v-if="source.last_error" class="error">
          {{ t('sources.lastError', { message: describeError(source.last_error, t).text }) }}
        </p>
        <div class="controls">
          <div class="form-check">
            <input
              :id="`${id}-active-${source.id}`"
              type="checkbox"
              :checked="source.active"
              :disabled="updating"
              @change="update({ source, active: ($event.target as HTMLInputElement).checked })"
            />
            <label :for="`${id}-active-${source.id}`">{{ t('sources.activeShort') }}</label>
          </div>
          <button
            type="button"
            class="button"
            data-variant="primary"
            :disabled="!source.active"
            :aria-label="t('sources.collectLabel', { label: source.label })"
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
      </li>
    </ul>
    <p role="status" :class="{ error: isError }">{{ message }}</p>

    <form class="card form add" :aria-labelledby="`${id}-add`" @submit.prevent="add()">
      <h3 :id="`${id}-add`">{{ t('engagement.sources.add') }}</h3>
      <fieldset class="choice">
        <legend class="form-label">{{ t('addSource.type') }}</legend>
        <div v-for="value in ENGAGEMENT_SOURCE_TYPES" :key="value" class="form-check">
          <input :id="`${id}-type-${value}`" v-model="type" type="radio" :value="value" />
          <label :for="`${id}-type-${value}`">{{ t(`sourceType.${value}`) }}</label>
        </div>
      </fieldset>
      <div class="form-row">
        <label :for="`${id}-label`">{{ t('addRss.label') }}</label>
        <input
          :id="`${id}-label`"
          v-model="label"
          class="field"
          type="text"
          required
          maxlength="200"
        />
      </div>
      <div class="form-row">
        <label :for="`${id}-query`">{{ t('engagement.sources.query') }}</label>
        <input
          :id="`${id}-query`"
          v-model="query"
          class="field"
          type="text"
          required
          maxlength="300"
          :placeholder="t('engagement.sources.queryPlaceholder')"
          :aria-describedby="`${id}-query-hint`"
        />
        <p :id="`${id}-query-hint`" class="hint">{{ t(`engagement.sources.queryHint.${type}`) }}</p>
      </div>
      <div class="pair">
        <div v-if="type === 'hackernews'" class="form-row">
          <label :for="`${id}-scope`">{{ t('engagement.sources.scope') }}</label>
          <select :id="`${id}-scope`" v-model="scope" class="field">
            <option value="all">{{ t('engagement.sources.scopes.all') }}</option>
            <option value="stories">{{ t('engagement.sources.scopes.stories') }}</option>
            <option value="comments">{{ t('engagement.sources.scopes.comments') }}</option>
          </select>
        </div>
        <div v-if="type === 'hackernews'" class="form-row">
          <label :for="`${id}-points`">{{ t('engagement.sources.minPoints') }}</label>
          <input
            :id="`${id}-points`"
            v-model.number="minPoints"
            class="field number"
            type="number"
            min="0"
            step="1"
          />
        </div>
        <div v-if="type === 'bluesky'" class="form-row">
          <label :for="`${id}-lang`"
            >{{ t('engagement.sources.lang') }} ({{ t('common.optional') }})</label
          >
          <input
            :id="`${id}-lang`"
            v-model="lang"
            class="field number"
            type="text"
            maxlength="2"
            pattern="[a-z]{2}"
            spellcheck="false"
            :aria-describedby="`${id}-lang-hint`"
          />
          <p :id="`${id}-lang-hint`" class="hint">{{ t('engagement.sources.langHint') }}</p>
        </div>
        <div class="form-row">
          <label :for="`${id}-max`">{{ t('engagement.sources.maxResults') }}</label>
          <input
            :id="`${id}-max`"
            v-model.number="maxResults"
            class="field number"
            type="number"
            min="1"
            max="50"
            step="1"
            required
          />
        </div>
      </div>
      <div>
        <button type="submit" class="button" data-variant="primary" :disabled="adding">
          {{ adding ? t('common.saving') : t('searchSource.submit') }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.engagement-sources {
  display: grid;
  gap: var(--space-4);
  max-width: 44rem;
}

.engagement-sources h2,
.engagement-sources h3,
.engagement-sources p {
  margin: 0;
}

.sources {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.source {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
}

.source[data-active='false'] {
  background: var(--color-surface-2);
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}

.head h3 {
  font-size: 1.125rem;
}

.query {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4);
}

.add {
  padding: var(--space-5) var(--space-6);
}

.choice {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-5);
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
}

.choice legend {
  width: 100%;
  margin-bottom: var(--space-1);
  padding: 0;
  font-family: inherit;
  font-size: 1rem;
}

.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: var(--space-4);
}

.pair .field {
  width: 100%;
  min-width: 0;
}

.pair .number {
  max-width: 8rem;
}
</style>
