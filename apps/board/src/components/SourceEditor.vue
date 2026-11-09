<script setup lang="ts">
import {
  SEARCH_SOURCE_TYPES,
  type ItemKind,
  type SearchSourceType,
  type Source,
} from '@pann/shared'
import { useMutation, useQueryCache } from '@pinia/colada'
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type SourcePatch } from '../lib/api'
import { describeError } from '../lib/errors'
import { toConfig, toDraft } from '../lib/source-draft'
import KindSelect from './KindSelect.vue'
import SearchSourceFields from './SearchSourceFields.vue'

/** Name, content kind and, for searches, the query settings of a source. */
const props = defineProps<{ topicId: string; source: Source }>()
const emit = defineEmits<{ done: [message: string] }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const searchType = computed(() =>
  (SEARCH_SOURCE_TYPES as readonly string[]).includes(props.source.type)
    ? (props.source.type as SearchSourceType)
    : null,
)
const label = ref(props.source.label)
const kind = ref<ItemKind | null>(props.source.default_kind)
const draft = ref(toDraft(props.source.config))
const error = ref('')

const { mutate, isLoading } = useMutation({
  mutation: () => {
    const patch: SourcePatch = { label: label.value, default_kind: kind.value }
    if (searchType.value)
      patch.config = toConfig(searchType.value, draft.value, props.source.config)
    return api.updateSource(props.topicId, props.source.id, patch)
  },
  async onSuccess(source) {
    await queryCache.invalidateQueries({ key: ['sources', props.topicId] })
    emit('done', t('sources.updated', { label: source.label }))
  },
  onError(err) {
    error.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <form
    class="form editor"
    :aria-label="t('sources.editLabel', { label: source.label })"
    @submit.prevent="mutate()"
  >
    <div class="pair">
      <div class="form-row">
        <label :for="`${id}-label`">{{ t('addRss.label') }}</label>
        <input
          :id="`${id}-label`"
          v-model="label"
          class="field"
          type="text"
          required
          maxlength="200"
        />
      </div>
      <div class="form-row">
        <label :for="`${id}-kind`">{{ t('addRss.kind') }}</label>
        <KindSelect
          :id="`${id}-kind`"
          :topic-id="topicId"
          v-model="kind"
          :aria-describedby="`${id}-kind-hint`"
        />
      </div>
      <p :id="`${id}-kind-hint`" class="hint">{{ t('addRss.kindHint') }}</p>
    </div>
    <SearchSourceFields v-if="searchType" v-model="draft" :type="searchType" />
    <p v-else class="hint">{{ t('sources.rssUrlFixed') }}</p>
    <div class="actions">
      <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
        {{ isLoading ? t('common.saving') : t('common.save') }}
      </button>
      <button type="button" class="button" @click="emit('done', '')">
        {{ t('common.cancel') }}
      </button>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
  </form>
</template>

<style scoped>
.editor {
  gap: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
}

.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--space-4);
}

.pair .hint {
  grid-column: 1 / -1;
  margin-top: calc(-1 * var(--space-3));
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.error {
  margin: 0;
}
</style>
