<script setup lang="ts">
import { ITEM_KINDS, type TopicConfig } from '@pann/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import IntervalSelect from '../components/IntervalSelect.vue'
import TopicNav from '../components/TopicNav.vue'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { useTopicName } from '../lib/topic-name'

const props = defineProps<{ topicId: string }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()
const topicName = useTopicName(() => props.topicId)

const {
  data: topic,
  isPending,
  error,
} = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})

/** Local copy edited by the form. */
const collection = ref<TopicConfig['collection']>()
const ai = ref<TopicConfig['ai']>()
watch(
  topic,
  (value) => {
    if (!value) return
    collection.value = structuredClone(value.config.collection)
    ai.value = structuredClone(value.config.ai)
  },
  { immediate: true },
)

const message = ref('')
const isError = ref(false)
const { mutate, isLoading } = useMutation({
  mutation: () => api.updateConfig(props.topicId, { collection: collection.value, ai: ai.value }),
  async onSuccess() {
    isError.value = false
    message.value = t('common.saved')
    await queryCache.invalidateQueries({ key: ['topic', props.topicId] })
    await queryCache.invalidateQueries({ key: ['sources', props.topicId] })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <h1 tabindex="-1">{{ t('settings.heading', { topic: topicName }) }}</h1>
  <TopicNav :topic-id="topicId" />

  <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <form v-else-if="collection" class="form settings" @submit.prevent="mutate()">
    <fieldset :aria-describedby="`${id}-hint`">
      <legend>{{ t('settings.collection') }}</legend>
      <p :id="`${id}-hint`" class="hint">{{ t('settings.collectionHint') }}</p>
      <div class="grid">
        <div v-for="kind in ITEM_KINDS" :key="kind" class="form-row">
          <label :for="`${id}-${kind}`">{{ t(`kind.${kind}`) }}</label>
          <IntervalSelect
            :id="`${id}-${kind}`"
            :model-value="collection.intervals_hours[kind]"
            @update:model-value="(v) => v && (collection!.intervals_hours[kind] = v)"
          />
        </div>
        <div class="form-row">
          <label :for="`${id}-default`">{{ t('settings.other') }}</label>
          <IntervalSelect
            :id="`${id}-default`"
            :model-value="collection.default_hours"
            @update:model-value="(v) => v && (collection!.default_hours = v)"
          />
        </div>
      </div>
    </fieldset>
    <fieldset v-if="ai">
      <legend>{{ t('settings.triage') }}</legend>
      <div class="form-row">
        <label :for="`${id}-threshold`">{{ t('settings.threshold') }}</label>
        <input
          :id="`${id}-threshold`"
          v-model.number="ai.relevance_threshold"
          class="field threshold"
          type="number"
          min="0"
          max="100"
          step="1"
          required
          :aria-describedby="`${id}-threshold-hint`"
        />
        <p :id="`${id}-threshold-hint`" class="hint">{{ t('settings.thresholdHint') }}</p>
      </div>
    </fieldset>
    <div>
      <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
        {{ isLoading ? t('common.saving') : t('common.save') }}
      </button>
    </div>
  </form>
  <p role="status" :class="{ error: isError }">{{ message }}</p>
</template>

<style scoped>
.settings {
  max-width: 40rem;
}

.threshold {
  max-width: 8rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-3);
}
</style>
