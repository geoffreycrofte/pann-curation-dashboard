<script setup lang="ts">
/**
 * First comment of a LinkedIn post: the default of the topic, none, or its own text.
 * Stored as null (default), '' (none) or the text, like `posts.first_comment`.
 */
import { FIRST_COMMENT_MAX } from '@pann/shared'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { describeError } from '../lib/errors'
import { toast } from '../lib/toast'

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
watch(
  () => props.value,
  (value) => {
    mode.value = modeOf(value)
    own.value = value ?? ''
  },
)

const next = computed(() =>
  mode.value === 'default' ? null : mode.value === 'none' ? '' : own.value.trim(),
)
const dirty = computed(() => next.value !== props.value)

const saving = ref(false)
const message = ref('')
async function submit() {
  if (mode.value === 'own' && !own.value.trim()) {
    message.value = t('firstComment.empty')
    return
  }
  saving.value = true
  message.value = ''
  try {
    await props.save(next.value)
    toast(t('firstComment.saved'))
  } catch (err) {
    message.value = describeError((err as Error).message, t).text
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="first-comment" @submit.prevent="submit">
    <fieldset :disabled="readonly">
      <legend>{{ t('firstComment.title') }}</legend>
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
        ></textarea>
      </div>
      <div v-if="!readonly">
        <button type="submit" class="button" :disabled="!dirty || saving">
          {{ saving ? t('common.saving') : t('firstComment.save') }}
        </button>
      </div>
    </fieldset>
    <p role="status" class="error">{{ message }}</p>
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

.first-comment legend {
  padding: 0 var(--space-1);
  font-weight: 650;
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
