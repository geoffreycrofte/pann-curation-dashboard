<script setup lang="ts">
import {
  effectiveIntervalHours,
  type ItemKind,
  type SearchSourceType,
  type TopicConfig,
} from '@pann/shared'
import { useMutation, useQueryCache } from '@pinia/colada'
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { emptyDraft, toConfig } from '../lib/source-draft'
import IntervalSelect from './IntervalSelect.vue'
import KindSelect from './KindSelect.vue'
import SearchSourceFields from './SearchSourceFields.vue'

const props = defineProps<{ topicId: string; config: TopicConfig; type: SearchSourceType }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const label = ref('')
const draft = ref(emptyDraft())
const kind = ref<ItemKind | null>(null)
const intervalHours = ref<number | null>(null)
const message = ref('')
const isError = ref(false)

const inherited = computed(() =>
  effectiveIntervalHours(
    { active: true, default_kind: kind.value, interval_hours: null, last_run_at: null },
    props.config,
  ),
)

const { mutate, isLoading } = useMutation({
  mutation: () =>
    api.addSearchSource(props.topicId, {
      type: props.type,
      label: label.value,
      config: toConfig(props.type, draft.value),
      default_kind: kind.value,
      interval_hours: intervalHours.value,
    }),
  async onSuccess(source) {
    isError.value = false
    message.value = t('searchSource.created', { label: source.label })
    label.value = ''
    draft.value = emptyDraft()
    await queryCache.invalidateQueries({ key: ['sources', props.topicId] })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <form class="form" @submit.prevent="mutate()">
    <div class="form-row">
      <label :for="`${id}-label`">{{ t('addRss.label') }}</label>
      <input
        :id="`${id}-label`"
        v-model="label"
        class="field"
        type="text"
        required
        maxlength="200"
        :placeholder="t(`searchSource.${type}.labelPlaceholder`)"
      />
    </div>
    <SearchSourceFields v-model="draft" :type="type" />
    <div class="form-row">
      <label :for="`${id}-kind`">{{ t('addRss.kind') }}</label>
      <KindSelect
        :id="`${id}-kind`"
        :topic-id="topicId"
        v-model="kind"
        :aria-describedby="`${id}-kind-hint`"
      />
      <p :id="`${id}-kind-hint`" class="hint">{{ t('addRss.kindHint') }}</p>
    </div>
    <div class="form-row">
      <label :for="`${id}-interval`">{{ t('addRss.frequency') }}</label>
      <IntervalSelect :id="`${id}-interval`" v-model="intervalHours" :inherited-hours="inherited" />
    </div>
    <div>
      <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
        {{ isLoading ? t('common.saving') : t('searchSource.submit') }}
      </button>
    </div>
    <p role="status" :class="{ error: isError }">{{ message }}</p>
  </form>
</template>
