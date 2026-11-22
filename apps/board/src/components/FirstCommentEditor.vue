<script setup lang="ts">
/**
 * First comment of a LinkedIn post: the default of the topic, none, or its own text.
 * Stored as null (default), '' (none) or the text, like `posts.first_comment`. Saved by
 * itself: a choice at once, a text a moment after typing.
 */
import { FIRST_COMMENT_MAX } from '@glimr/shared'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAutosave } from '../lib/autosave'
import AutosaveStatus from './AutosaveStatus.vue'

const props = defineProps<{
  /** Current value of the post. */
  value: string | null
  /** Default of the topic for the language of the post ('' when none is set). */
  defaultText: string
  lang?: string
  readonly?: boolean
  save: (value: string | null) => Promise<void>
}>()

const { t } = useI18n()
const id = useId()

type Mode = 'default' | 'none' | 'own'
const modeOf = (value: string | null): Mode =>
  value === null ? 'default' : value === '' ? 'none' : 'own'

const mode = ref<Mode>(modeOf(props.value))
const own = ref(props.value ?? '')

const next = computed(() =>
  mode.value === 'default' ? null : mode.value === 'none' ? '' : own.value.trim(),
)
const autosave = useAutosave({
  value: () => next.value,
  stored: () => props.value,
  save: (value) => props.save(value),
  // Choosing "own" waits for its text.
  valid: () => mode.value !== 'own' || !!own.value.trim(),
})
watch(
  () => props.value,
  (value) => {
    if (autosave.dirty.value || autosave.state.value === 'saving') return
    mode.value = modeOf(value)
    own.value = value ?? ''
  },
)
// A choice is saved at once; a text, after the pause.
watch(mode, () => {
  if (mode.value !== 'own') void autosave.flush()
})
</script>

<template>
  <form class="first-comment" @submit.prevent="autosave.flush()">
    <fieldset :disabled="readonly">
      <legend>{{ t('firstComment.title') }}</legend>
      <AutosaveStatus
        v-if="!readonly"
        class="save-state"
        :state="autosave.state.value"
        :error="autosave.error.value"
      />
      <label class="choice">
        <input v-model="mode" type="radio" :name="`${id}-mode`" value="default" />
        <span>
          {{ t('firstComment.default') }}
          <span class="hint quote" :lang="defaultText ? lang : undefined">
            {{ defaultText || t('firstComment.noDefault') }}
          </span>
        </span>
      </label>
      <label class="choice">
        <input v-model="mode" type="radio" :name="`${id}-mode`" value="none" />
        <span>{{ t('firstComment.none') }}</span>
      </label>
      <label class="choice">
        <input v-model="mode" type="radio" :name="`${id}-mode`" value="own" />
        <span>{{ t('firstComment.own') }}</span>
      </label>
      <div v-if="mode === 'own'" class="form-row">
        <label :for="`${id}-text`">{{ t('firstComment.ownLabel') }}</label>
        <textarea
          :id="`${id}-text`"
          v-model="own"
          class="field"
          rows="3"
          :lang="lang"
          :maxlength="FIRST_COMMENT_MAX"
          @blur="autosave.flush()"
        ></textarea>
        <p v-if="autosave.state.value === 'invalid'" class="hint">
          {{ t('firstComment.empty') }}
        </p>
      </div>
    </fieldset>
  </form>
</template>

<style scoped>
.first-comment fieldset {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
}

/* The title inside the frame, not across its border (floated, the legend is laid out
 * like the other children), its save state on the same line. */
.first-comment legend {
  float: left;
  padding: 0;
  font-weight: 650;
}

/* The legend and its save state on one line, every other part on its own. */
.first-comment fieldset {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.first-comment fieldset > :not(legend, .save-state) {
  flex-basis: 100%;
}

.choice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  min-height: 2.75rem;
  padding-top: var(--space-2);
}

.choice input {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  margin: 0;
  accent-color: var(--color-accent-text);
}

.quote {
  display: block;
  white-space: pre-line;
}

.first-comment textarea {
  width: 100%;
  resize: vertical;
}

.first-comment p {
  margin: 0;
}

.first-comment p:empty {
  display: none;
}
</style>
