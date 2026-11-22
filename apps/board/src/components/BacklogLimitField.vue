<script setup lang="ts">
/**
 * Pause of the scheduled collection beyond N items to sort (`pause_above` of the
 * curation or engagement settings): a checkbox, then the limit. null: no pause.
 */
import { BACKLOG_LIMIT_MAX, BACKLOG_LIMIT_MIN } from '@glimr/shared'
import { ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ module: 'curation' | 'engagement' }>()
const model = defineModel<number | null>({ required: true })
const { t } = useI18n()
const id = useId()

/** Proposed when the pause is turned on: about a week of sorting for most topics. */
const DEFAULT_LIMIT = 100
// Kept while the box is unticked, so ticking it again brings back the last value.
const limit = ref(model.value ?? DEFAULT_LIMIT)
const on = ref(model.value !== null)
watch([on, limit], () => (model.value = on.value ? limit.value : null))
watch(model, (value) => {
  on.value = value !== null
  if (value !== null) limit.value = value
})
</script>

<template>
  <div class="backlog">
    <div class="form-check">
      <input :id="`${id}-on`" v-model="on" type="checkbox" :aria-describedby="`${id}-hint`" />
      <label :for="`${id}-on`">{{ t(`backlog.setting.${props.module}`) }}</label>
    </div>
    <div v-if="on" class="form-row">
      <label :for="`${id}-limit`">{{ t('backlog.limit') }}</label>
      <input
        :id="`${id}-limit`"
        v-model.number="limit"
        class="field number"
        type="number"
        :min="BACKLOG_LIMIT_MIN"
        :max="BACKLOG_LIMIT_MAX"
        step="1"
        required
        :aria-describedby="`${id}-hint`"
      />
    </div>
    <p :id="`${id}-hint`" class="hint">{{ t(`backlog.hint.${props.module}`) }}</p>
  </div>
</template>

<style scoped>
.backlog {
  display: grid;
  gap: var(--space-2);
}

.backlog p {
  margin: 0;
}

.number {
  max-width: 8rem;
}
</style>
