<script setup lang="ts">
/**
 * Where the automatic save of a field stands, as a quiet badge beside its label. The page
 * says once that texts save by themselves. Only the outcome (saved, error) is announced;
 * "Saving…" is shown, not read at every pause.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { describeError } from '../lib/errors'
import type { AutosaveState } from '../lib/autosave'

const props = defineProps<{ state: AutosaveState; error?: unknown }>()
const { t } = useI18n()

const errorText = computed(() =>
  t('autosave.error', {
    message: describeError((props.error as Error)?.message ?? 'unexpected', t).text,
  }),
)
</script>

<template>
  <span class="autosave">
    <span v-if="state === 'saving'" class="badge" aria-hidden="true">
      {{ t('autosave.saving') }}
    </span>
    <span role="status" class="outcome">
      <span v-if="state === 'saved'" class="badge" data-tone="success" data-dot>
        {{ t('autosave.saved') }}
      </span>
      <span v-else-if="state === 'error'" class="badge error-badge" data-tone="danger" data-dot>
        {{ errorText }}
      </span>
    </span>
  </span>
</template>

<style scoped>
.autosave,
.outcome {
  display: inline-flex;
  align-items: center;
}

/* An error can be long: it wraps instead of overflowing. */
.error-badge {
  white-space: normal;
}
</style>
