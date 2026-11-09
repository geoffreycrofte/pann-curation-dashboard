<script setup lang="ts">
import { useMutation, useQueryCache } from '@pinia/colada'
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type TopicWithConfig } from '../lib/api'
import { describeError } from '../lib/errors'

/** How the engagement triage judges conversations: user settings of the topic. */
const props = defineProps<{ topic: TopicWithConfig }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const criteria = ref(props.topic.config.engagement.criteria)
const threshold = ref(props.topic.config.engagement.threshold)
const maxAge = ref(props.topic.config.engagement.max_age_days)
const message = ref('')
const isError = ref(false)

const { mutate, isLoading } = useMutation({
  mutation: () =>
    api.updateConfig(props.topic.id, {
      engagement: {
        criteria: criteria.value,
        threshold: threshold.value,
        max_age_days: maxAge.value,
      },
    }),
  async onSuccess() {
    isError.value = false
    message.value = t('common.saved')
    await queryCache.invalidateQueries({ key: ['topic', props.topic.id] })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <form class="form engagement-settings" @submit.prevent="mutate()">
    <h2>{{ t('engagement.settings.title') }}</h2>
    <p class="hint">{{ t('engagement.settings.intro') }}</p>
    <p class="hint">
      {{ t('engagement.settings.product') }}
      <RouterLink
        :to="{ name: 'settings', params: { topicId: topic.id }, query: { tab: 'product' } }"
      >
        {{ t('engagement.settings.productLink') }}
      </RouterLink>
    </p>
    <div class="form-row">
      <label :for="`${id}-criteria`">{{ t('engagement.settings.criteria') }}</label>
      <textarea
        :id="`${id}-criteria`"
        v-model="criteria"
        class="field"
        rows="5"
        maxlength="4000"
        :placeholder="t('engagement.settings.criteriaPlaceholder')"
        :aria-describedby="`${id}-criteria-hint`"
      ></textarea>
      <p :id="`${id}-criteria-hint`" class="hint">{{ t('engagement.settings.criteriaHint') }}</p>
    </div>
    <div class="pair">
      <div class="form-row">
        <label :for="`${id}-threshold`">{{ t('engagement.settings.threshold') }}</label>
        <input
          :id="`${id}-threshold`"
          v-model.number="threshold"
          class="field number"
          type="number"
          min="0"
          max="100"
          step="1"
          required
          :aria-describedby="`${id}-threshold-hint`"
        />
        <p :id="`${id}-threshold-hint`" class="hint">
          {{ t('engagement.settings.thresholdHint') }}
        </p>
      </div>
      <div class="form-row">
        <label :for="`${id}-age`">{{ t('engagement.settings.maxAge') }}</label>
        <input
          :id="`${id}-age`"
          v-model.number="maxAge"
          class="field number"
          type="number"
          min="1"
          max="90"
          step="1"
          required
          :aria-describedby="`${id}-age-hint`"
        />
        <p :id="`${id}-age-hint`" class="hint">{{ t('engagement.settings.maxAgeHint') }}</p>
      </div>
    </div>
    <div>
      <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
        {{ isLoading ? t('common.saving') : t('common.save') }}
      </button>
    </div>
    <p role="status" :class="{ error: isError }">{{ message }}</p>
  </form>
</template>

<style scoped>
.engagement-settings {
  max-width: 40rem;
}

.engagement-settings h2,
.engagement-settings p {
  margin: 0;
}

textarea.field {
  width: 100%;
  resize: vertical;
}

.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--space-4);
}

.number {
  max-width: 8rem;
}
</style>
