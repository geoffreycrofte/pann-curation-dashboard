<script setup lang="ts">
import type { SearchSourceType } from '@pann/shared'
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SearchDraft } from '../lib/source-draft'

/** Settings of an Exa search or a GitHub repository search (add and edit forms). */
defineProps<{ type: SearchSourceType }>()
const draft = defineModel<SearchDraft>({ required: true })
const { t } = useI18n()
const id = useId()
</script>

<template>
  <div class="form-row">
    <label :for="`${id}-query`">{{ t(`searchSource.${type}.query`) }}</label>
    <textarea
      v-if="type === 'exa'"
      :id="`${id}-query`"
      v-model="draft.query"
      class="field"
      rows="2"
      required
      maxlength="1000"
      :placeholder="t('searchSource.exa.queryPlaceholder')"
      :aria-describedby="`${id}-query-hint`"
    ></textarea>
    <input
      v-else
      :id="`${id}-query`"
      v-model="draft.query"
      class="field"
      type="text"
      required
      maxlength="256"
      spellcheck="false"
      :placeholder="t('searchSource.github.queryPlaceholder')"
      :aria-describedby="`${id}-query-hint`"
    />
    <p :id="`${id}-query-hint`" class="hint">{{ t(`searchSource.${type}.queryHint`) }}</p>
  </div>

  <template v-if="type === 'exa'">
    <div class="form-row">
      <label :for="`${id}-num`">{{ t('searchSource.exa.numResults') }}</label>
      <input
        :id="`${id}-num`"
        v-model.number="draft.num_results"
        class="field number"
        type="number"
        min="1"
        max="25"
        step="1"
        required
        :aria-describedby="`${id}-num-hint`"
      />
      <p :id="`${id}-num-hint`" class="hint">{{ t('searchSource.exa.numResultsHint') }}</p>
    </div>
    <div class="domains">
      <div class="form-row">
        <label :for="`${id}-include`">
          {{ t('searchSource.exa.include') }} ({{ t('common.optional') }})
        </label>
        <textarea
          :id="`${id}-include`"
          v-model="draft.include_domains"
          class="field"
          rows="3"
          spellcheck="false"
          :aria-describedby="`${id}-domains-hint`"
        ></textarea>
      </div>
      <div class="form-row">
        <label :for="`${id}-exclude`">
          {{ t('searchSource.exa.exclude') }} ({{ t('common.optional') }})
        </label>
        <textarea
          :id="`${id}-exclude`"
          v-model="draft.exclude_domains"
          class="field"
          rows="3"
          spellcheck="false"
          :aria-describedby="`${id}-domains-hint`"
        ></textarea>
      </div>
      <p :id="`${id}-domains-hint`" class="hint">{{ t('searchSource.exa.domainsHint') }}</p>
    </div>
  </template>

  <div v-else class="pair">
    <div class="form-row">
      <label :for="`${id}-stars`">{{ t('searchSource.github.minStars') }}</label>
      <input
        :id="`${id}-stars`"
        v-model.number="draft.min_stars"
        class="field number"
        type="number"
        min="0"
        step="1"
        required
        :aria-describedby="`${id}-stars-hint`"
      />
      <p :id="`${id}-stars-hint`" class="hint">{{ t('searchSource.github.minStarsHint') }}</p>
    </div>
    <div class="form-row">
      <label :for="`${id}-max`">{{ t('searchSource.github.maxResults') }}</label>
      <input
        :id="`${id}-max`"
        v-model.number="draft.max_results"
        class="field number"
        type="number"
        min="1"
        max="30"
        step="1"
        required
        :aria-describedby="`${id}-max-hint`"
      />
      <p :id="`${id}-max-hint`" class="hint">{{ t('searchSource.github.maxResultsHint') }}</p>
    </div>
  </div>
</template>

<style scoped>
textarea.field {
  width: 100%;
  resize: vertical;
}

.number {
  max-width: 8rem;
}

.domains,
.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: var(--space-4);
}

.domains .hint {
  grid-column: 1 / -1;
  margin-top: calc(-1 * var(--space-3));
}
</style>
