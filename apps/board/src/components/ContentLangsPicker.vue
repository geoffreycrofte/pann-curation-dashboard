<script setup lang="ts">
/**
 * Languages a topic writes in (any language): the chosen ones as a list, each with a
 * Remove button, and an Add control offering common languages or any typed tag.
 */
import { canonicalLang, COMMON_LANGS, MAX_OUTPUT_LANGS } from '@glimr/shared'
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { contentLangName } from '../lib/langs'

const props = defineProps<{
  legend: string
  hint?: string
  /** A settings section: a card with its title inside (see .section-card). */
  card?: boolean
}>()
const langs = defineModel<string[]>({ required: true })
const { t, locale } = useI18n()
const id = useId()

const OTHER = '__other'
const choice = ref('')
const otherCode = ref('')
const message = ref('')
const isError = ref(false)

// Common languages not chosen yet, by their name in the interface language.
const offered = computed(() =>
  COMMON_LANGS.filter((lang) => !langs.value.includes(lang)).sort((a, b) =>
    contentLangName(a).localeCompare(contentLangName(b), locale.value),
  ),
)
const full = computed(() => langs.value.length >= MAX_OUTPUT_LANGS)

function add() {
  const raw = choice.value === OTHER ? otherCode.value : choice.value
  const lang = canonicalLang(raw)
  isError.value = true
  if (!lang) {
    message.value = t('langs.invalid')
    return
  }
  if (langs.value.includes(lang)) {
    message.value = t('langs.already', { lang: contentLangName(lang) })
    return
  }
  if (full.value) {
    message.value = t('langs.max', { max: MAX_OUTPUT_LANGS })
    return
  }
  langs.value = [...langs.value, lang]
  choice.value = ''
  otherCode.value = ''
  isError.value = false
  message.value = t('langs.added', { lang: contentLangName(lang) })
}

function remove(lang: string) {
  if (langs.value.length <= 1) return
  langs.value = langs.value.filter((l) => l !== lang)
  isError.value = false
  message.value = t('langs.removed', { lang: contentLangName(lang) })
}
</script>

<template>
  <fieldset
    class="langs-picker"
    :class="{ 'section-card': props.card }"
    :aria-describedby="props.hint ? `${id}-hint` : undefined"
  >
    <legend :class="{ 'section-title': props.card }">{{ props.legend }}</legend>
    <p v-if="props.hint" :id="`${id}-hint`" class="hint">{{ props.hint }}</p>
    <ul class="chosen">
      <li v-for="lang in langs" :key="lang">
        <span class="lang-name">
          <span :lang="lang">{{ contentLangName(lang) }}</span>
          <span class="code">({{ lang }})</span>
        </span>
        <!-- The last language cannot be removed: no button rather than a disabled one. -->
        <button
          v-if="langs.length > 1"
          type="button"
          class="button"
          data-size="small"
          data-variant="danger"
          @click="remove(lang)"
        >
          {{ t('langs.remove') }}<span class="visually-hidden"> {{ contentLangName(lang) }}</span>
        </button>
      </li>
    </ul>
    <div v-if="!full" class="add">
      <div class="add-row">
        <div class="form-row">
          <label :for="`${id}-choice`">{{ t('langs.add') }}</label>
          <select :id="`${id}-choice`" v-model="choice" class="field">
            <option value="" disabled>{{ t('langs.choose') }}</option>
            <option v-for="lang in offered" :key="lang" :value="lang">
              {{ contentLangName(lang) }} ({{ lang }})
            </option>
            <option :value="OTHER">{{ t('langs.other') }}</option>
          </select>
        </div>
        <button
          v-if="choice !== OTHER"
          type="button"
          class="button"
          :disabled="!choice"
          @click="add"
        >
          {{ t('langs.addButton') }}
        </button>
      </div>
      <div v-if="choice === OTHER" class="add-row">
        <div class="form-row">
          <label :for="`${id}-code`">{{ t('langs.otherCode') }}</label>
          <input
            :id="`${id}-code`"
            v-model="otherCode"
            class="field small"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :aria-describedby="`${id}-code-hint`"
            @keydown.enter.prevent="add"
          />
        </div>
        <button type="button" class="button" @click="add">
          {{ t('langs.addButton') }}
        </button>
        <p :id="`${id}-code-hint`" class="hint">{{ t('langs.otherHint') }}</p>
      </div>
    </div>
    <p v-else class="hint">{{ t('langs.max', { max: MAX_OUTPUT_LANGS }) }}</p>
    <p role="status" :class="{ error: isError }">{{ message }}</p>
  </fieldset>
</template>

<style scoped>
.langs-picker {
  display: grid;
  gap: var(--space-3);
}

.langs-picker p {
  margin: 0;
}

.langs-picker p:empty {
  display: none;
}

/* The chosen languages as a bordered list: the name, then a small Remove at the end. */
.chosen {
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  list-style: none;
}

.chosen li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-4);
  min-height: 3rem;
  padding: var(--space-1) var(--space-2) var(--space-1) var(--space-4);
}

.chosen li + li {
  border-top: 1px solid var(--color-border-subtle);
}

.lang-name {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.code {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.add {
  display: grid;
  gap: var(--space-3);
}

/* The control and its Add button on one line (the button wraps under on a phone). */
.add-row {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--space-2) var(--space-3);
}

.add-row .form-row {
  flex: 1 1 14rem;
}

.add-row .hint {
  flex-basis: 100%;
}

.small {
  max-width: 10rem;
}
</style>
