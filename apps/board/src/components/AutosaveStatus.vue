<script setup lang="ts">
/**
 * Where an automatic save stands, next to the field it saves. Only the outcome (saved,
 * error, why it waits) is announced; "Saving…" is shown, not read at every pause.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { describeError } from '../lib/errors'
import type { AutosaveState } from '../lib/autosave'
import Icon from './Icon.vue'

const props = defineProps<{
  state: AutosaveState
  error?: unknown
  /** Why a change waits (an empty required text). */
  invalidText?: string
}>()
const { t } = useI18n()

const announced = computed(() => {
  if (props.state === 'saved') return t('autosave.saved')
  if (props.state === 'invalid') return props.invalidText ?? ''
  if (props.state === 'error')
    return t('autosave.error', {
      message: describeError((props.error as Error)?.message ?? 'unexpected', t).text,
    })
  return ''
})
</script>

<template>
  <p class="autosave" :data-state="state">
    <span v-if="state === 'saving'" aria-hidden="true">{{ t('autosave.saving') }}</span>
    <span v-else-if="state === 'idle' || state === 'pending'" aria-hidden="true">
      {{ t('autosave.auto') }}
    </span>
    <span role="status" class="outcome">
      <Icon v-if="state === 'saved'" name="check" :size="14" />
      <Icon v-else-if="state === 'error'" name="alert-circle" :size="14" />
      {{ announced }}
    </span>
  </p>
</template>

<style scoped>
.autosave {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 1.5rem;
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.outcome {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.outcome:empty {
  display: none;
}

.autosave[data-state='saved'] .outcome {
  color: var(--color-success);
}

.autosave[data-state='error'] .outcome {
  color: var(--color-danger);
  font-weight: 600;
}
</style>
