<script setup lang="ts">
import type { ItemKind, TopicConfig } from '@pann/shared'
import { effectiveIntervalHours } from '@pann/shared'
import { useMutation, useQueryCache } from '@pinia/colada'
import { computed, nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { describeError } from '../lib/errors'
import { api, type AddRssResult } from '../lib/api'
import IntervalSelect from './IntervalSelect.vue'
import KindSelect from './KindSelect.vue'

const props = defineProps<{ topicId: string; config: TopicConfig }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const url = ref('')
const label = ref('')
const kind = ref<ItemKind | null>(null)
const intervalHours = ref<number | null>(null)
const candidates = ref<Extract<AddRssResult, { status: 'choose' }>['candidates']>([])
const chosen = ref('')
const message = ref('')
const isError = ref(false)
const chooseEl = ref<HTMLElement>()

const inherited = computed(() =>
  effectiveIntervalHours(
    { active: true, default_kind: kind.value, interval_hours: null, last_run_at: null },
    props.config,
  ),
)

const { mutate, isLoading } = useMutation({
  mutation: (feedUrl: string) =>
    api.addRss(props.topicId, {
      url: feedUrl,
      label: label.value.trim() || undefined,
      default_kind: kind.value,
      interval_hours: intervalHours.value,
    }),
  async onSuccess(result) {
    isError.value = false
    if (result.status === 'choose') {
      candidates.value = result.candidates
      chosen.value = result.candidates[0]?.url ?? ''
      message.value = ''
      await nextTick()
      chooseEl.value?.focus()
      return
    }
    message.value = t('addRss.created', { label: result.source.label })
    candidates.value = []
    url.value = ''
    label.value = ''
    await queryCache.invalidateQueries({ key: ['sources', props.topicId] })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <section :aria-labelledby="`${id}-heading`" class="add-rss">
    <h2 :id="`${id}-heading`">{{ t('addRss.title') }}</h2>
    <form class="form" @submit.prevent="mutate(url)">
      <div class="form-row">
        <label :for="`${id}-url`">{{ t('addRss.url') }}</label>
        <input
          :id="`${id}-url`"
          v-model="url"
          class="field"
          type="url"
          required
          :aria-describedby="`${id}-url-hint`"
          @input="candidates = []"
        />
        <p :id="`${id}-url-hint`" class="hint">{{ t('addRss.urlHint') }}</p>
      </div>
      <div class="form-row">
        <label :for="`${id}-label`">{{ t('addRss.label') }} ({{ t('common.optional') }})</label>
        <input
          :id="`${id}-label`"
          v-model="label"
          class="field"
          type="text"
          maxlength="200"
          :aria-describedby="`${id}-label-hint`"
        />
        <p :id="`${id}-label-hint`" class="hint">{{ t('addRss.labelHint') }}</p>
      </div>
      <div class="form-row">
        <label :for="`${id}-kind`">{{ t('addRss.kind') }}</label>
        <KindSelect :id="`${id}-kind`" v-model="kind" :aria-describedby="`${id}-kind-hint`" />
        <p :id="`${id}-kind-hint`" class="hint">{{ t('addRss.kindHint') }}</p>
      </div>
      <div class="form-row">
        <label :for="`${id}-interval`">{{ t('addRss.frequency') }}</label>
        <IntervalSelect
          :id="`${id}-interval`"
          v-model="intervalHours"
          :inherited-hours="inherited"
        />
      </div>
      <div>
        <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
          {{ isLoading ? t('addRss.submitting') : t('addRss.submit') }}
        </button>
      </div>
    </form>

    <form v-if="candidates.length" class="form choose" @submit.prevent="mutate(chosen)">
      <fieldset ref="chooseEl" tabindex="-1">
        <legend>{{ t('addRss.choose') }}</legend>
        <div v-for="(candidate, index) in candidates" :key="candidate.url" class="form-check">
          <input
            :id="`${id}-candidate-${index}`"
            v-model="chosen"
            type="radio"
            name="candidate"
            :value="candidate.url"
          />
          <label :for="`${id}-candidate-${index}`">
            {{ candidate.title ?? t('addRss.untitled') }}
            <span class="hint">{{ candidate.url }}</span>
          </label>
        </div>
      </fieldset>
      <div>
        <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
          {{ t('addRss.chooseSubmit') }}
        </button>
      </div>
    </form>

    <p role="status" :class="{ error: isError }">{{ message }}</p>
  </section>
</template>

<style scoped>
.add-rss {
  max-width: 44rem;
  margin-top: var(--space-6);
  padding: var(--space-5) var(--space-6) var(--space-6);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.add-rss h2 {
  margin-top: 0;
}

.choose {
  margin-top: var(--space-4);
}

.choose .hint {
  display: block;
  word-break: break-all;
}
</style>
