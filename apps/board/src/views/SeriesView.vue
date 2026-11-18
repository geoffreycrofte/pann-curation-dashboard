<script setup lang="ts">
/**
 * A series of posts (Création): a subject, a number of posts and a span. Pann proposes a
 * plan (one angle per post), the person edits it, then each post becomes a composition
 * drafted from its angle. "Schedule the series" spreads them over the span, each on the
 * first free Création slot from its share of the span.
 */
import { useQuery, useQueryCache } from '@pinia/colada'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { api, type SeriesPost } from '../lib/api'
import { describeError } from '../lib/errors'
import { toast } from '../lib/toast'

const props = defineProps<{ topicId: string; seriesId: string }>()
const { t, d, locale } = useI18n()
const id = useId()
const router = useRouter()
const queryCache = useQueryCache()
const isNew = computed(() => props.seriesId === 'new')

const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const {
  data: series,
  error: loadError,
  refetch,
} = useQuery({
  key: () => ['series', props.topicId, props.seriesId],
  query: () => api.series(props.topicId, props.seriesId),
  enabled: () => !isNew.value,
})

// The plan and the drafting run as jobs: poll while something is pending.
const pending = computed(
  () =>
    series.value?.status === 'pending' ||
    !!series.value?.compositions?.some((c) => c.draft_status === 'pending'),
)
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  [pending, series],
  () => {
    clearTimeout(timer)
    if (pending.value) timer = setTimeout(() => void refetch(), 2000)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))

// New series -------------------------------------------------------------------------
const form = ref({ subject: '', notes: '', post_count: 4, span_days: 14 })
const formError = ref('')
const creating = ref(false)
async function create() {
  formError.value = ''
  if (form.value.subject.trim().length < 3) {
    formError.value = t('series.errors.subject')
    document.getElementById(`${id}-subject`)?.focus()
    return
  }
  creating.value = true
  try {
    const created = await api.createSeries(props.topicId, {
      ...form.value,
      subject: form.value.subject.trim(),
      ui_lang: locale.value === 'en' ? 'en' : 'fr',
    })
    await router.replace({
      name: 'series',
      params: { topicId: props.topicId, seriesId: created.id },
    })
  } catch (err) {
    formError.value = describeError((err as Error).message, t).text
  } finally {
    creating.value = false
  }
}

// Plan --------------------------------------------------------------------------------
const plan = ref<SeriesPost[]>([])
const planDirty = computed(
  () => JSON.stringify(plan.value) !== JSON.stringify(series.value?.plan ?? []),
)
// The plan from the server replaces the local one unless the person edited it since.
let loadedPlan = '[]'
watch(
  () => series.value?.plan,
  (value) => {
    if (!value) return
    if (JSON.stringify(plan.value) === loadedPlan) plan.value = value.map((p) => ({ ...p }))
    loadedPlan = JSON.stringify(value)
  },
  { immediate: true },
)
function addPost() {
  if (plan.value.length < 8) plan.value.push({ subject: '', angle: '' })
}
function removePost(index: number) {
  plan.value.splice(index, 1)
}
const message = ref('')
const isError = ref(false)
async function savePlan(silent = false) {
  const cleaned = plan.value.filter((p) => p.subject.trim())
  await api.updateSeriesPlan(props.topicId, props.seriesId, cleaned)
  plan.value = cleaned
  await refetch()
  if (!silent) toast(t('common.saved'))
}
async function createDrafts() {
  message.value = ''
  try {
    if (planDirty.value) await savePlan(true)
    await api.createSeriesCompositions(props.topicId, props.seriesId)
    await refetch()
    await queryCache.invalidateQueries({ key: ['compositions', props.topicId] })
    toast(t('series.created'))
  } catch (err) {
    isError.value = true
    message.value = describeError((err as Error).message, t).text
  }
}

// Scheduling over the span --------------------------------------------------------------
const compositions = computed(() => series.value?.compositions ?? [])
const allDrafted = computed(
  () => compositions.value.length > 0 && compositions.value.every((c) => c.draft_status === 'idle'),
)
const formatDate = (value: string) =>
  d(new Date(value), {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: topic.value?.config.schedule.timezone,
  })
const scheduling = ref(false)
const results = ref<Record<string, string>>({})
async function scheduleSeries() {
  if (!series.value) return
  scheduling.value = true
  results.value = {}
  const start = Date.now()
  const step = (series.value.span_days * 24 * 3600_000) / compositions.value.length
  for (const [index, c] of compositions.value.entries()) {
    if (c.status !== 'draft') continue
    try {
      const notBefore = new Date(start + index * step).toISOString()
      const done = await api.scheduleComposition(props.topicId, c.id, 'next_slot', notBefore)
      results.value[c.id] = t('series.scheduledFor', { date: formatDate(done.publish_at) })
    } catch (err) {
      results.value[c.id] = describeError((err as Error).message, t).text
    }
  }
  scheduling.value = false
  await refetch()
  await queryCache.invalidateQueries({ key: ['compositions', props.topicId] })
}
</script>

<template>
  <div class="series">
    <p>
      <RouterLink :to="{ name: 'compose', params: { topicId } }">{{
        t('compose.back')
      }}</RouterLink>
    </p>

    <!-- New series -->
    <form v-if="isNew" class="block" novalidate @submit.prevent="create">
      <h1 tabindex="-1">{{ t('series.newTitle') }}</h1>
      <p class="hint">{{ t('series.intro') }}</p>
      <div class="form-row">
        <label :for="`${id}-subject`">{{ t('series.subject') }}</label>
        <input
          :id="`${id}-subject`"
          v-model="form.subject"
          class="field"
          type="text"
          maxlength="300"
          :aria-invalid="!!formError || undefined"
          :aria-describedby="formError ? `${id}-error` : undefined"
        />
      </div>
      <div class="form-row">
        <label :for="`${id}-notes`">{{ t('series.notes') }}</label>
        <textarea
          :id="`${id}-notes`"
          v-model="form.notes"
          class="field"
          rows="5"
          maxlength="10000"
          :aria-describedby="`${id}-notes-hint`"
        ></textarea>
        <p :id="`${id}-notes-hint`" class="hint">{{ t('series.notesHint') }}</p>
      </div>
      <div class="pair">
        <div class="form-row">
          <label :for="`${id}-count`">{{ t('series.count') }}</label>
          <input
            :id="`${id}-count`"
            v-model.number="form.post_count"
            class="field small"
            type="number"
            min="2"
            max="8"
          />
        </div>
        <div class="form-row">
          <label :for="`${id}-span`">{{ t('series.span') }}</label>
          <input
            :id="`${id}-span`"
            v-model.number="form.span_days"
            class="field small"
            type="number"
            min="1"
            max="60"
          />
        </div>
      </div>
      <p v-if="formError" :id="`${id}-error`" class="error" role="alert">{{ formError }}</p>
      <div>
        <button type="submit" class="button" data-variant="primary" :disabled="creating">
          {{ t('series.plan') }}
        </button>
      </div>
    </form>

    <p v-else-if="loadError" role="alert">
      {{ t('board.loadError', { message: loadError.message }) }}
    </p>

    <template v-else-if="series">
      <h1 tabindex="-1">{{ t('series.title', { subject: series.subject }) }}</h1>
      <p class="hint">
        {{ t('series.summary', { count: series.post_count, days: series.span_days }) }}
      </p>
      <p v-if="series.status === 'pending'" role="status">{{ t('series.planning') }}</p>
      <p v-else-if="series.status === 'failed'" class="error" role="alert">
        {{ describeError(series.error ?? 'unexpected', t).text }}
      </p>

      <!-- Plan, editable until the drafts exist -->
      <form
        v-if="series.status === 'ready' && !compositions.length"
        class="block"
        novalidate
        @submit.prevent="savePlan()"
      >
        <h2>{{ t('series.planTitle') }}</h2>
        <p class="hint">{{ t('series.planHint') }}</p>
        <ol class="plan">
          <li v-for="(post, index) in plan" :key="index">
            <fieldset>
              <legend>{{ t('series.post', { n: index + 1 }) }}</legend>
              <div class="form-row">
                <label :for="`${id}-p${index}-subject`">{{ t('series.postSubject') }}</label>
                <input
                  :id="`${id}-p${index}-subject`"
                  v-model="post.subject"
                  class="field"
                  type="text"
                  maxlength="300"
                />
              </div>
              <div class="form-row">
                <label :for="`${id}-p${index}-angle`">{{ t('series.angle') }}</label>
                <textarea
                  :id="`${id}-p${index}-angle`"
                  v-model="post.angle"
                  class="field"
                  rows="3"
                  maxlength="2000"
                ></textarea>
              </div>
              <div>
                <button
                  type="button"
                  class="button"
                  :aria-label="t('series.removeLabel', { n: index + 1 })"
                  @click="removePost(index)"
                >
                  {{ t('series.remove') }}
                </button>
              </div>
            </fieldset>
          </li>
        </ol>
        <div class="actions">
          <button v-if="plan.length < 8" type="button" class="button" @click="addPost">
            {{ t('series.add') }}
          </button>
          <button type="submit" class="button" :disabled="!planDirty">
            {{ t('common.save') }}
          </button>
          <button
            type="button"
            class="button"
            data-variant="primary"
            :disabled="!plan.some((p) => p.subject.trim())"
            @click="createDrafts"
          >
            {{ t('series.createDrafts') }}
          </button>
        </div>
        <p role="status" :class="{ error: isError }">{{ message }}</p>
      </form>

      <!-- The posts of the series -->
      <section v-if="compositions.length" class="block" :aria-labelledby="`${id}-posts`">
        <h2 :id="`${id}-posts`">{{ t('series.posts') }}</h2>
        <ol class="posts">
          <li v-for="c in compositions" :key="c.id">
            <RouterLink :to="{ name: 'composition', params: { topicId, compositionId: c.id } }">
              {{ c.subject }}
            </RouterLink>
            <span class="meta">
              <template v-if="c.draft_status === 'pending'">{{
                t('compose.posts.drafting')
              }}</template>
              <template v-else-if="c.draft_status === 'failed'">{{
                describeError(c.draft_error ?? 'unexpected', t).text
              }}</template>
              <template v-else-if="c.status === 'scheduled' && c.publish_at">{{
                t('series.scheduledFor', { date: formatDate(c.publish_at) })
              }}</template>
              <template v-else>{{ t(`compose.list.groups.${c.status}`) }}</template>
            </span>
            <span v-if="results[c.id]" class="meta" role="status">{{ results[c.id] }}</span>
          </li>
        </ol>
        <p class="hint">{{ t('series.scheduleHint') }}</p>
        <div>
          <button
            type="button"
            class="button"
            data-variant="primary"
            :disabled="!allDrafted || scheduling"
            @click="scheduleSeries"
          >
            {{ t('series.schedule') }}
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.series {
  display: grid;
  gap: var(--space-5);
  max-width: 48rem;
}

.series h1,
.series > p {
  margin: 0;
}

.block {
  display: grid;
  gap: var(--space-4);
}

.block h1,
.block h2 {
  margin: 0;
}

.plan,
.posts {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.plan fieldset {
  display: grid;
  gap: var(--space-3);
}

.posts li {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.meta {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.field {
  width: 100%;
}

.small {
  max-width: 8rem;
}

textarea.field {
  resize: vertical;
}

.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--space-4);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
</style>
