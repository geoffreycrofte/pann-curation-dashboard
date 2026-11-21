<script setup lang="ts">
/**
 * Settings of the Création tool: its own publication slots (distinct from the news
 * watch's, same time zone) and the mode a new composition starts in.
 */
import { COMPOSE_MODES, type ComposeMode } from '@pann/shared'
import { useMutation, useQueryCache } from '@pinia/colada'
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type TopicWithConfig } from '../../lib/api'
import { describeError } from '../../lib/errors'
import { parseSlots } from '../../lib/onboarding'
import { toast } from '../../lib/toast'

const props = defineProps<{ topic: TopicWithConfig }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const mode = ref<ComposeMode>(props.topic.config.compose.mode)
const postsPerDay = ref(props.topic.config.compose.posts_per_day)
const slotsText = ref(props.topic.config.compose.slots.join(', '))
const slotsError = ref(false)
const message = ref('')
const isError = ref(false)

const { mutate, isLoading } = useMutation({
  mutation: (slots: string[]) =>
    api.updateConfig(props.topic.id, {
      compose: { mode: mode.value, posts_per_day: postsPerDay.value, slots },
    }),
  async onSuccess() {
    isError.value = false
    message.value = ''
    toast(t('common.saved'))
    await queryCache.invalidateQueries({ key: ['topic', props.topic.id] })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})

function submit() {
  const slots = parseSlots(slotsText.value)
  slotsError.value = !slots
  if (!slots) return
  mutate(slots)
}
</script>

<template>
  <form class="section-stack" novalidate @submit.prevent="submit">
    <fieldset class="section-card" :aria-describedby="`${id}-hint`">
      <legend class="section-title">{{ t('compose.settings.heading') }}</legend>
      <p :id="`${id}-hint`" class="hint">
        {{ t('compose.settings.hint', { timezone: topic.config.schedule.timezone }) }}
      </p>
      <div class="pair">
        <div class="form-row">
          <label :for="`${id}-per-day`">{{ t('settings.postsPerDay') }}</label>
          <input
            :id="`${id}-per-day`"
            v-model.number="postsPerDay"
            class="field small"
            type="number"
            min="0"
            max="10"
            step="1"
          />
        </div>
        <div class="form-row">
          <label :for="`${id}-slots`">{{ t('settings.slots') }}</label>
          <input
            :id="`${id}-slots`"
            v-model="slotsText"
            class="field"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            :aria-invalid="slotsError || undefined"
            :aria-describedby="`${id}-slots-hint${slotsError ? ` ${id}-slots-error` : ''}`"
          />
          <p :id="`${id}-slots-hint`" class="hint">{{ t('settings.slotsHint') }}</p>
          <p v-if="slotsError" :id="`${id}-slots-error`" class="error" role="alert">
            {{ t('settings.slotsInvalid') }}
          </p>
        </div>
      </div>
      <div class="form-row">
        <label :for="`${id}-mode`">{{ t('compose.settings.mode') }}</label>
        <select :id="`${id}-mode`" v-model="mode" class="field">
          <option v-for="m in COMPOSE_MODES" :key="m" :value="m">
            {{ t(`compose.modes.${m}`) }}
          </option>
        </select>
      </div>
      <div class="section-actions">
        <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
          {{ isLoading ? t('common.saving') : t('common.save') }}
        </button>
        <p role="status" :class="{ error: isError }">{{ message }}</p>
      </div>
    </fieldset>
  </form>
</template>

<style scoped>
.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--space-4);
  align-items: start;
}

.field {
  width: 100%;
}

.small {
  max-width: 8rem;
}
</style>
