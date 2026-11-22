<script setup lang="ts">
import type { TopicProduct } from '@glimr/shared'
import { useMutation, useQueryCache } from '@pinia/colada'
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type TopicWithConfig } from '../lib/api'
import { describeError } from '../lib/errors'
import { toast } from '../lib/toast'

const props = defineProps<{ topic: TopicWithConfig }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const product = ref<TopicProduct>(structuredClone(props.topic.config.product))

/** Free-text fields, in reading order (field of the product, max length, rows). */
const TEXTS = [
  { field: 'description', max: 2000, rows: 4 },
  { field: 'audience', max: 2000, rows: 4 },
  { field: 'messages', max: 4000, rows: 6 },
  { field: 'proof_points', max: 4000, rows: 6 },
  { field: 'claims_to_avoid', max: 4000, rows: 4 },
] as const

const message = ref('')
const isError = ref(false)
const { mutate, isLoading } = useMutation({
  mutation: () => api.updateConfig(props.topic.id, { product: product.value }),
  async onSuccess() {
    isError.value = false
    message.value = ''
    toast(t('common.saved'))
    await queryCache.invalidateQueries({ key: ['topic', props.topic.id] })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <form class="section-stack" @submit.prevent="mutate()">
    <fieldset class="section-card" :aria-describedby="`${id}-hint`">
      <legend class="section-title">{{ t('product.heading') }}</legend>
      <p :id="`${id}-hint`" class="hint">{{ t('product.hint') }}</p>
      <div class="identity">
        <div class="form-row">
          <label :for="`${id}-name`">{{ t('product.name') }}</label>
          <input
            :id="`${id}-name`"
            v-model="product.name"
            class="field"
            type="text"
            maxlength="100"
          />
        </div>
        <div class="form-row">
          <label :for="`${id}-url`">{{ t('product.url') }}</label>
          <input
            :id="`${id}-url`"
            v-model.trim="product.url"
            class="field"
            type="url"
            inputmode="url"
            autocomplete="url"
            placeholder="https://"
          />
        </div>
      </div>
      <div v-for="text in TEXTS" :key="text.field" class="form-row">
        <label :for="`${id}-${text.field}`">{{ t(`product.fields.${text.field}.label`) }}</label>
        <textarea
          :id="`${id}-${text.field}`"
          v-model="product[text.field]"
          class="field"
          :rows="text.rows"
          :maxlength="text.max"
          :aria-describedby="`${id}-${text.field}-hint`"
        ></textarea>
        <p :id="`${id}-${text.field}-hint`" class="hint">
          {{ t(`product.fields.${text.field}.hint`) }}
        </p>
      </div>
      <div class="form-row">
        <label :for="`${id}-disclosure`">{{ t('product.disclosure') }}</label>
        <input
          :id="`${id}-disclosure`"
          v-model="product.disclosure"
          class="field"
          type="text"
          maxlength="300"
          :placeholder="t('product.disclosurePlaceholder')"
          :aria-describedby="`${id}-disclosure-hint`"
        />
        <p :id="`${id}-disclosure-hint`" class="hint">{{ t('product.disclosureHint') }}</p>
      </div>
      <div class="section-actions">
        <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
          {{ isLoading ? t('common.saving') : t('common.save') }}
        </button>
        <p role="status" :class="{ error: isError }">{{ message }}</p>
      </div>
    </fieldset>
  </form>
</template>

<style scoped>
.identity {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--space-4);
}

textarea.field {
  width: 100%;
  resize: vertical;
}
</style>
