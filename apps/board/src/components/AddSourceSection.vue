<script setup lang="ts">
import type { SourceType, TopicConfig } from '@pann/shared'

/** Sources of the curation board (conversations are added from the Engagement tab). */
type CurationSourceType = Extract<SourceType, 'rss' | 'exa' | 'github'>
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import AddRssForm from './AddRssForm.vue'
import AddSearchSourceForm from './AddSearchSourceForm.vue'

defineProps<{ topicId: string; config: TopicConfig }>()
const { t } = useI18n()
const id = useId()
const TYPES: CurationSourceType[] = ['rss', 'exa', 'github']
const type = ref<CurationSourceType>('rss')
</script>

<template>
  <section :aria-labelledby="`${id}-heading`" class="add-source">
    <h2 :id="`${id}-heading`">{{ t('addSource.title') }}</h2>
    <fieldset class="type-choice">
      <legend class="form-label">{{ t('addSource.type') }}</legend>
      <div class="choices">
        <label v-for="value in TYPES" :key="value" class="choice">
          <input v-model="type" type="radio" :name="`${id}-type`" :value="value" />
          <span class="choice-text">
            <span class="choice-name">{{ t(`sourceType.${value}`) }}</span>
            <span class="hint">{{ t(`addSource.describe.${value}`) }}</span>
          </span>
        </label>
      </div>
    </fieldset>
    <AddRssForm v-if="type === 'rss'" :topic-id="topicId" :config="config" />
    <AddSearchSourceForm v-else :key="type" :topic-id="topicId" :config="config" :type="type" />
  </section>
</template>

<style scoped>
.add-source {
  display: grid;
  gap: var(--space-5);
  max-width: 44rem;
  margin-top: var(--space-6);
  padding: var(--space-5) var(--space-6) var(--space-6);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.add-source h2 {
  margin: 0;
}

.type-choice {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
}

.type-choice legend {
  margin-bottom: var(--space-2);
  padding: 0;
  font-family: inherit;
  font-size: 1rem;
}

.choices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: var(--space-2);
}

/* Each option is a selectable tile; the radio stays visible (state not by color alone). */
.choice {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-3) var(--space-4);
  border: 1.5px solid var(--color-border-subtle);
  border-radius: var(--radius);
  cursor: pointer;
}

.choice:hover {
  border-color: var(--color-border);
}

.choice:has(input:checked) {
  border-color: var(--color-text);
  background: var(--color-surface-2);
}

.choice input {
  width: 1.125rem;
  height: 1.125rem;
  margin-top: 0.2rem;
  accent-color: var(--color-accent-text);
}

.choice-text {
  display: grid;
  gap: var(--space-1);
}

.choice-name {
  font-weight: 650;
}

@media (forced-colors: active) {
  .choice:has(input:checked) {
    border: 3px solid Highlight;
  }
}
</style>
