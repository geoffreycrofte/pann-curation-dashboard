<script setup lang="ts">
import type { ItemKind } from '@pann/shared'
import { useMutation, useQueryCache } from '@pinia/colada'
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { describeError } from '../lib/errors'
import { api } from '../lib/api'
import KindSelect from './KindSelect.vue'

const props = defineProps<{ topicId: string }>()
const { t } = useI18n()
const queryCache = useQueryCache()
const id = useId()

const open = ref(false)
const url = ref('')
const title = ref('')
const kind = ref<ItemKind | null>(null)
const validate = ref(true)
const message = ref('')
const isError = ref(false)

const { mutate, isLoading } = useMutation({
  mutation: () =>
    api.addItem(props.topicId, {
      url: url.value,
      title: title.value.trim() || undefined,
      kind: kind.value,
      status: validate.value ? 'validated' : 'new',
    }),
  async onSuccess(result) {
    isError.value = false
    const status = t(`statusOne.${result.status}`)
    message.value = result.created
      ? t('addItem.created', { title: result.title ?? result.canonical_url, status })
      : t('addItem.exists', { status })
    if (result.created) {
      url.value = ''
      title.value = ''
      kind.value = null
    }
    await queryCache.invalidateQueries({ key: ['items', props.topicId] })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <section class="add-item" :aria-labelledby="`${id}-heading`">
    <h2 :id="`${id}-heading`" class="visually-hidden">{{ t('addItem.title') }}</h2>
    <button
      type="button"
      class="button"
      :aria-expanded="open"
      :aria-controls="`${id}-form`"
      @click="open = !open"
    >
      {{ t('addItem.toggle') }}
    </button>

    <form v-show="open" :id="`${id}-form`" class="form" @submit.prevent="mutate()">
      <div class="form-row">
        <label :for="`${id}-url`">{{ t('addItem.url') }}</label>
        <input
          :id="`${id}-url`"
          v-model="url"
          class="field"
          type="url"
          required
          autocomplete="url"
        />
      </div>
      <div class="form-row">
        <label :for="`${id}-title`"
          >{{ t('addItem.linkTitle') }} ({{ t('common.optional') }})</label
        >
        <input
          :id="`${id}-title`"
          v-model="title"
          class="field"
          type="text"
          maxlength="500"
          :aria-describedby="`${id}-title-hint`"
        />
        <p :id="`${id}-title-hint`" class="hint">{{ t('addItem.linkTitleHint') }}</p>
      </div>
      <div class="form-row">
        <label :for="`${id}-kind`">{{ t('addItem.kind') }}</label>
        <KindSelect :id="`${id}-kind`" v-model="kind" />
      </div>
      <div class="form-check">
        <input
          :id="`${id}-validate`"
          v-model="validate"
          type="checkbox"
          :aria-describedby="`${id}-validate-hint`"
        />
        <label :for="`${id}-validate`">{{ t('addItem.validate') }}</label>
        <p :id="`${id}-validate-hint`" class="hint">{{ t('addItem.validateHint') }}</p>
      </div>
      <div>
        <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
          {{ isLoading ? t('addItem.submitting') : t('addItem.submit') }}
        </button>
      </div>
    </form>
    <p role="status" :class="{ error: isError }">{{ message }}</p>
  </section>
</template>

<style scoped>
.add-item {
  margin-bottom: var(--space-4);
}

.form {
  max-width: 36rem;
  margin-top: var(--space-3);
}
</style>
