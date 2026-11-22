<script setup lang="ts">
/**
 * Public pricing page: the offers, then what the same work costs with separate tools.
 * The competitors' prices were read on their pages in November 2026 and are given as
 * examples only (docs/studies/tarifs-concurrence.md).
 */
import { useQuery } from '@pinia/colada'
import { useI18n } from 'vue-i18n'
import Icon from '../components/Icon.vue'
import PlanPicker from '../components/PlanPicker.vue'
import ToolsCompare from '../components/ToolsCompare.vue'
import { api } from '../lib/api'

const { t } = useI18n()
const {
  data: plans,
  isPending,
  error,
} = useQuery({ key: ['public-plans'], query: api.publicPlans })
</script>

<template>
  <div class="pricing">
    <header class="intro">
      <h1 tabindex="-1">{{ t('pricing.title') }}</h1>
      <p class="lead">{{ t('pricing.lead') }}</p>
      <p class="trial">
        <Icon name="sparkles" :size="18" />
        {{ t('pricing.trial') }}
      </p>
    </header>

    <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="error" role="alert">{{ t('pricing.loadError') }}</p>
    <PlanPicker v-else-if="plans" :plans="plans" mode="public" :heading-level="2" />

    <ToolsCompare />
  </div>
</template>

<style scoped>
/* Signed out, the page brings its own margins (the board's main has them). */
:global(main.public .pricing) {
  padding: var(--space-6) clamp(var(--space-4), 4vw, 3.5rem) 4rem;
}

.pricing {
  display: grid;
  gap: var(--space-8);
  max-width: 68rem;
  margin: 0 auto;
}

.intro {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  text-align: center;
}

.intro h1 {
  margin: 0;
  font-size: clamp(2.25rem, 5vw, 3.25rem);
}

.lead {
  max-width: 44rem;
  margin: 0;
  font-size: 1.1875rem;
}

.trial {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-pill);
  background: var(--color-accent-soft);
  font-weight: 650;
}

.trial .icon {
  color: var(--color-accent-text);
}
</style>
