<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { postLength } from '@pann/shared'

/** A labelled textarea with its own save button, length counter and status message. */
const props = defineProps<{
  label: string
  value: string
  lang?: string
  limit?: number
  limitName?: string
  edited?: boolean
  save: (text: string) => Promise<unknown>
}>()
const { t } = useI18n()
const id = useId()

const text = ref(props.value)
watch(
  () => props.value,
  (value) => {
    if (!dirty.value) text.value = value
  },
)
const dirty = computed(() => text.value !== props.value)
const length = computed(() => postLength(text.value))
const over = computed(() => (props.limit ? length.value - props.limit : 0))

const saving = ref(false)
const message = ref('')
const isError = ref(false)
async function submit() {
  saving.value = true
  try {
    await props.save(text.value)
    isError.value = false
    message.value = t('draft.saved')
  } catch (err) {
    isError.value = true
    message.value = t('common.error', { message: (err as Error).message })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="text-saver" @submit.prevent="submit">
    <label :for="`${id}-text`" class="form-label">{{ label }}</label>
    <textarea
      :id="`${id}-text`"
      v-model="text"
      class="field"
      :lang="lang"
      rows="5"
      :aria-describedby="`${id}-meta`"
      :aria-invalid="over > 0 || undefined"
    ></textarea>
    <p :id="`${id}-meta`" class="hint">
      <span v-if="limit">{{ t('draft.length', { count: length, limit }) }}</span>
      <span v-if="over > 0" class="error">
        {{ t('draft.tooLong', { over, channel: limitName }) }}</span
      >
      <span v-if="edited"> {{ t('draft.edited') }}</span>
    </p>
    <div class="row">
      <button type="submit" class="button" :disabled="saving || !dirty">
        {{ t('draft.save') }}
      </button>
      <p role="status" class="status" :class="{ error: isError }">{{ message }}</p>
    </div>
  </form>
</template>

<style scoped>
.text-saver {
  display: grid;
  gap: var(--space-1);
}

textarea {
  width: 100%;
  resize: vertical;
  line-height: 1.5;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.status {
  margin: 0;
}

/* One piece of information per line (length, warning, edited note). */
.hint span {
  display: block;
}
</style>
