<script setup lang="ts">
import { postLength } from '@pann/shared'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

export type RewritePreset = 'shorter' | 'longer' | 'formal' | 'casual' | 'custom'

/**
 * A labelled textarea with its own save button, length counter and status message,
 * an "edited by hand" mark and, when `rewrite` is given, AI rewrites of the text.
 */
const props = defineProps<{
  label: string
  value: string
  lang?: string
  limit?: number
  limitName?: string
  edited?: boolean
  /** Counts the published length (e.g. post plus link); defaults to the text alone. */
  measure?: (text: string) => number
  /** Translation key of the length line ({count}, {limit}). */
  lengthKey?: string
  /** Shown under the label: what the text is used for. */
  description?: string
  readonly?: boolean
  save: (text: string) => Promise<unknown>
  /** Returns a rewritten version of the text; nothing is saved until "Save". */
  rewrite?: (text: string, preset: RewritePreset, instruction?: string) => Promise<string>
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
const length = computed(() => (props.measure ?? postLength)(text.value))
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
    beforeRewrite.value = null
  } catch (err) {
    isError.value = true
    message.value = t('common.error', { message: (err as Error).message })
  } finally {
    saving.value = false
  }
}

// ---------------------------------------------------------------------------
// AI rewrite: the proposal replaces the text in the field, "Undo" brings it back.
// ---------------------------------------------------------------------------
const PRESETS = ['shorter', 'longer', 'formal', 'casual'] as const
const rewriting = ref(false)
const beforeRewrite = ref<string | null>(null)
const textarea = ref<HTMLTextAreaElement>()
const customOpen = ref(false)
const instruction = ref('')

async function runRewrite(preset: RewritePreset, custom?: string) {
  if (!props.rewrite) return
  rewriting.value = true
  isError.value = false
  message.value = t('rewrite.running')
  try {
    const previous = text.value
    text.value = await props.rewrite(previous, preset, custom)
    beforeRewrite.value = previous
    message.value = t('rewrite.done')
    await nextTick()
    textarea.value?.focus()
  } catch (err) {
    isError.value = true
    message.value = (err as Error).message
  } finally {
    rewriting.value = false
  }
}

function submitCustom() {
  const value = instruction.value.trim()
  if (!value) return
  customOpen.value = false
  void runRewrite('custom', value)
}

async function undoRewrite() {
  if (beforeRewrite.value === null) return
  text.value = beforeRewrite.value
  beforeRewrite.value = null
  message.value = t('rewrite.undone')
  await nextTick()
  textarea.value?.focus()
}
</script>

<template>
  <form class="text-saver" @submit.prevent="submit">
    <div class="head">
      <label :for="`${id}-text`" class="form-label">{{ label }}</label>
      <span v-if="edited && !dirty" class="badge" data-tone="accent">
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path
            d="M11.3 2.3l2.4 2.4-8 8L3 13l.3-2.7z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
        </svg>
        {{ t('draft.editedBadge') }}
      </span>
      <span v-if="dirty" class="badge" data-tone="accent" data-dot>{{ t('draft.unsaved') }}</span>

      <DropdownMenuRoot v-if="rewrite && !readonly">
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            class="button rewrite"
            :disabled="rewriting || saving"
            :aria-label="t('rewrite.label', { field: label })"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                d="M8 1.5l1.3 3.2 3.2 1.3-3.2 1.3L8 10.5 6.7 7.3 3.5 6l3.2-1.3zM12.5 10l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6zM3.5 10.5l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z"
                fill="currentColor"
              />
            </svg>
            {{ rewriting ? t('rewrite.running') : t('rewrite.button') }}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="menu" align="end" :side-offset="6">
            <DropdownMenuItem
              v-for="preset in PRESETS"
              :key="preset"
              class="menu-item"
              @select="runRewrite(preset)"
            >
              {{ t(`rewrite.presets.${preset}`) }}
            </DropdownMenuItem>
            <DropdownMenuSeparator class="menu-separator" />
            <DropdownMenuItem class="menu-item" @select="customOpen = true">
              {{ t('rewrite.presets.custom') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>
    <p v-if="description" :id="`${id}-desc`" class="hint">{{ description }}</p>
    <textarea
      :id="`${id}-text`"
      ref="textarea"
      v-model="text"
      class="field"
      :lang="lang"
      rows="5"
      :readonly="readonly || rewriting"
      :aria-describedby="`${description ? `${id}-desc ` : ''}${id}-meta`"
      :aria-invalid="over > 0 || undefined"
      :aria-busy="rewriting || undefined"
    ></textarea>
    <p :id="`${id}-meta`" class="hint">
      <span v-if="limit">{{ t(lengthKey ?? 'draft.length', { count: length, limit }) }}</span>
      <span v-if="over > 0" class="error">
        {{ t('draft.tooLong', { over, channel: limitName }) }}</span
      >
      <span v-if="edited">{{ t('draft.edited') }}</span>
    </p>
    <div v-if="!readonly" class="row">
      <button type="submit" class="button" :disabled="saving || rewriting || !dirty">
        {{ t('draft.save') }}
      </button>
      <button
        v-if="beforeRewrite !== null && dirty"
        type="button"
        class="button"
        :disabled="rewriting"
        @click="undoRewrite"
      >
        {{ t('rewrite.undo') }}
      </button>
      <p role="status" class="status" :class="{ error: isError }">{{ message }}</p>
    </div>

    <DialogRoot v-model:open="customOpen">
      <DialogPortal>
        <DialogOverlay class="dialog-overlay" />
        <DialogContent class="dialog">
          <DialogTitle class="dialog-title">{{ t('rewrite.customTitle') }}</DialogTitle>
          <DialogDescription>{{ t('rewrite.customText', { field: label }) }}</DialogDescription>
          <form class="form custom" @submit.prevent="submitCustom">
            <div class="form-row">
              <label :for="`${id}-instruction`">{{ t('rewrite.instruction') }}</label>
              <textarea
                :id="`${id}-instruction`"
                v-model="instruction"
                class="field"
                rows="3"
                maxlength="500"
                required
                :placeholder="t('rewrite.instructionPlaceholder')"
              ></textarea>
            </div>
            <div class="dialog-actions">
              <DialogClose class="button">{{ t('common.cancel') }}</DialogClose>
              <button type="submit" class="button" data-variant="primary">
                {{ t('rewrite.submit') }}
              </button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </form>
</template>

<style scoped>
.text-saver {
  display: grid;
  gap: var(--space-1);
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  min-height: 2.75rem;
}

.rewrite {
  min-height: 2.25rem;
  margin-inline-start: auto;
  padding-inline: var(--space-3);
  font-size: 0.875rem;
}

textarea {
  width: 100%;
  resize: vertical;
  line-height: 1.5;
}

textarea[aria-busy='true'] {
  opacity: 0.6;
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

.custom {
  margin-top: var(--space-4);
}

.custom textarea {
  width: 100%;
}
</style>
