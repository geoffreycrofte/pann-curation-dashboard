<script setup lang="ts">
import { slugify, type TopicKind } from '@pann/shared'
import { useMutation, useQueryCache } from '@pinia/colada'
import { computed, nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type TopicWithConfig } from '../lib/api'
import { describeError } from '../lib/errors'

/**
 * Kinds of content of the topic: Pann's defaults to start with, then renamed, added or
 * removed here. A removed kind is replaced, on its items and sources, by another one.
 */
const props = defineProps<{ topic: TopicWithConfig }>()
const { t, locale } = useI18n()
const id = useId()
const queryCache = useQueryCache()

interface Row extends TopicKind {
  /** Not saved yet: its key is made from its English name on save. */
  isNew: boolean
  uid: number
}
let nextUid = 0
const rows = ref<Row[]>(
  props.topic.config.kinds.map((k) => ({ ...k, isNew: false, uid: nextUid++ })),
)
/** Saved kinds being removed, with the kind that replaces them (null: no kind). */
const removed = ref<{ kind: TopicKind; replacement: string | null }[]>([])
const message = ref('')
const isError = ref(false)

const name = (k: TopicKind) => (locale.value === 'fr' ? k.label_fr : k.label_en) || k.key
const savedRows = computed(() => rows.value.filter((r) => !r.isNew))

async function addRow() {
  rows.value.push({
    key: '',
    label_fr: '',
    label_en: '',
    description: '',
    isNew: true,
    uid: nextUid++,
  })
  await nextTick()
  document.getElementById(`${id}-${rows.value.at(-1)!.uid}-fr`)?.focus()
}

async function removeRow(row: Row) {
  const index = rows.value.indexOf(row)
  rows.value.splice(index, 1)
  const fallback = savedRows.value[0]?.key ?? null
  // Nothing may be replaced by a kind that is itself being removed.
  for (const entry of removed.value) if (entry.replacement === row.key) entry.replacement = fallback
  if (!row.isNew) removed.value.push({ kind: row, replacement: fallback })
  // The focused button is gone: move to the neighbour row, or to "Add a kind".
  await nextTick()
  const neighbour = rows.value[Math.min(index, rows.value.length - 1)]
  document.getElementById(neighbour ? `${id}-${neighbour.uid}-fr` : `${id}-add`)?.focus()
}

function restore(entry: { kind: TopicKind }) {
  removed.value = removed.value.filter((r) => r !== entry)
  rows.value.push({ ...entry.kind, isNew: false, uid: nextUid++ })
}

/** Keys of new kinds: from the English name, unique in the topic. */
function withKeys(): TopicKind[] {
  const used = new Set(rows.value.filter((r) => !r.isNew).map((r) => r.key))
  return rows.value.map(({ isNew, uid: _uid, ...kind }) => {
    if (!isNew) return kind
    const base = slugify(kind.label_en || kind.label_fr).slice(0, 36) || 'kind'
    let key = base
    for (let n = 2; used.has(key); n++) key = `${base}-${n}`
    used.add(key)
    return { ...kind, key }
  })
}

const { mutate, isLoading } = useMutation({
  mutation: () => {
    const kinds = withKeys()
    const replacements = Object.fromEntries(removed.value.map((r) => [r.kind.key, r.replacement]))
    return api.setKinds(props.topic.id, kinds, replacements).then((config) => ({ config }))
  },
  async onSuccess({ config }) {
    isError.value = false
    message.value = t('kinds.saved')
    rows.value = config.kinds.map((k) => ({ ...k, isNew: false, uid: nextUid++ }))
    removed.value = []
    await queryCache.invalidateQueries({ key: ['topic', props.topic.id] })
    await queryCache.invalidateQueries({ key: ['sources', props.topic.id] })
    await queryCache.invalidateQueries({ key: ['items', props.topic.id] })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <form class="form kinds" @submit.prevent="mutate()">
    <h2 :id="`${id}-title`">{{ t('kinds.title') }}</h2>
    <p class="hint">{{ t('kinds.intro') }}</p>

    <fieldset v-for="row in rows" :key="row.uid" class="kind">
      <legend>{{ name(row) || t('kinds.newKind') }}</legend>
      <div class="names">
        <div class="form-row">
          <label :for="`${id}-${row.uid}-fr`">{{ t('kinds.labelFr') }}</label>
          <input
            :id="`${id}-${row.uid}-fr`"
            v-model="row.label_fr"
            class="field"
            type="text"
            lang="fr"
            required
            maxlength="60"
          />
        </div>
        <div class="form-row">
          <label :for="`${id}-${row.uid}-en`">{{ t('kinds.labelEn') }}</label>
          <input
            :id="`${id}-${row.uid}-en`"
            v-model="row.label_en"
            class="field"
            type="text"
            lang="en"
            required
            maxlength="60"
          />
        </div>
      </div>
      <div class="form-row">
        <label :for="`${id}-${row.uid}-desc`">
          {{ t('kinds.description') }} ({{ t('common.optional') }})
        </label>
        <textarea
          :id="`${id}-${row.uid}-desc`"
          v-model="row.description"
          class="field"
          rows="2"
          maxlength="300"
          :aria-describedby="`${id}-desc-hint`"
        ></textarea>
      </div>
      <div>
        <button
          type="button"
          class="button"
          :disabled="rows.length <= 1"
          :aria-label="t('kinds.removeLabel', { kind: name(row) || t('kinds.newKind') })"
          @click="removeRow(row)"
        >
          {{ t('kinds.remove') }}
        </button>
      </div>
    </fieldset>
    <p :id="`${id}-desc-hint`" class="hint">{{ t('kinds.descriptionHint') }}</p>

    <div>
      <button
        :id="`${id}-add`"
        type="button"
        class="button"
        :disabled="rows.length >= 20"
        @click="addRow"
      >
        {{ t('kinds.add') }}
      </button>
    </div>

    <section v-if="removed.length" class="removed" :aria-labelledby="`${id}-removed`">
      <h3 :id="`${id}-removed`">{{ t('kinds.removedTitle') }}</h3>
      <p class="hint">{{ t('kinds.removedHint') }}</p>
      <div v-for="entry in removed" :key="entry.kind.key" class="removed-row">
        <label :for="`${id}-replace-${entry.kind.key}`">
          {{ t('kinds.replaceLabel', { kind: name(entry.kind) }) }}
        </label>
        <select :id="`${id}-replace-${entry.kind.key}`" v-model="entry.replacement" class="field">
          <option v-for="row in savedRows" :key="row.key" :value="row.key">{{ name(row) }}</option>
          <option :value="null">{{ t('kindSelect.none') }}</option>
        </select>
        <button type="button" class="button" @click="restore(entry)">
          {{ t('kinds.restore') }}
        </button>
      </div>
    </section>

    <div>
      <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
        {{ isLoading ? t('common.saving') : t('common.save') }}
      </button>
    </div>
    <p role="status" :class="{ error: isError }">{{ message }}</p>
  </form>
</template>

<style scoped>
.kinds {
  max-width: 40rem;
}

.kinds h2,
.kinds h3,
.kinds p {
  margin: 0;
}

.kind {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
}

.kind legend {
  padding: 0 var(--space-2);
  font-size: 1.0625rem;
}

.names {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--space-3);
}

textarea.field {
  width: 100%;
  resize: vertical;
}

.removed {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-inline-start: 6px solid var(--color-accent-fill);
  border-radius: var(--radius);
  background: var(--color-accent-soft);
}

.removed h3 {
  font-size: 1rem;
}

.removed-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}
</style>
