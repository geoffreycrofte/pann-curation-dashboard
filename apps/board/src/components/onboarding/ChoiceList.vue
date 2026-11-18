<script setup lang="ts" generic="T extends string">
/**
 * Closed question with several answers: a real fieldset of checkboxes, its legend being
 * the question (in the conversation, the legend is styled as the assistant's bubble).
 */
import { useId } from 'vue'

const props = defineProps<{
  legend: string
  options: { value: T; label: string; hint?: string }[]
  hint?: string
  error?: string
  legendClass?: string
  /** Wraps the answers (not the legend): the conversation's answer card. */
  bodyClass?: string
}>()
const model = defineModel<T[]>({ required: true })
const id = useId()

const describedBy = () =>
  [props.hint ? `${id}-hint` : '', props.error ? `${id}-error` : ''].filter(Boolean).join(' ') ||
  undefined

function toggle(value: T, checked: boolean) {
  model.value = checked ? [...model.value, value] : model.value.filter((v) => v !== value)
}

/** Lets the conversation put the focus on the first answer. */
defineExpose({ focus: () => document.getElementById(`${id}-0`)?.focus() })
</script>

<template>
  <fieldset class="choices" :aria-invalid="!!error || undefined" :aria-describedby="describedBy()">
    <legend :class="legendClass">{{ legend }}</legend>
    <div class="body" :class="bodyClass">
      <p v-if="hint" :id="`${id}-hint`" class="hint">{{ hint }}</p>
      <label v-for="(option, index) in options" :key="option.value" class="choice">
        <input
          :id="`${id}-${index}`"
          type="checkbox"
          :value="option.value"
          :checked="model.includes(option.value)"
          @change="toggle(option.value, ($event.target as HTMLInputElement).checked)"
        />
        <span>
          <strong v-if="option.hint">{{ option.label }}</strong>
          <template v-else>{{ option.label }}</template>
          <span v-if="option.hint" class="hint">{{ option.hint }}</span>
        </span>
      </label>
      <slot />
      <p v-if="error" :id="`${id}-error`" class="error" role="alert">{{ error }}</p>
      <slot name="after" />
    </div>
  </fieldset>
</template>

<style scoped>
.choices {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.body {
  display: grid;
  gap: var(--space-1);
}

.choice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-height: 2.75rem;
  padding: var(--space-2) 0;
}

.choice input {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  margin: 0.15rem 0 0;
  accent-color: var(--color-accent-text);
}

.choice > span {
  display: grid;
  gap: var(--space-1);
}
</style>
