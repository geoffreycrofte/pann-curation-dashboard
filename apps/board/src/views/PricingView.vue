<script setup lang="ts">
/**
 * Public pricing page: the offers, then what the same work costs with separate tools.
 * The competitors' prices were read on their pages in November 2026 and are given as
 * examples only (docs/studies/tarifs-concurrence.md).
 */
import { useQuery } from '@pinia/colada'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PlanPicker from '../components/PlanPicker.vue'
import { api } from '../lib/api'

const { t, n } = useI18n()
const {
  data: plans,
  isPending,
  error,
} = useQuery({ key: ['public-plans'], query: api.publicPlans })

/** Without Pann, for one person, yearly prices per month (USD, as the vendors show them). */
const WITHOUT = [
  { need: 'publish', tool: 'Publer Business', usd: 24 },
  { need: 'watch', tool: 'Feedly Pro+', usd: 12 },
  { need: 'listen', tool: 'Syften Standard', usd: 49.95 },
] as const
const totalUsd = WITHOUT.reduce((sum, row) => sum + row.usd, 0)
const usd = (value: number) => n(value, { style: 'currency', currency: 'USD' })
/** With Pann: the intermediate offer, paid yearly. */
const withPann = computed(() => {
  const year = plans.value?.find((p) => p.key === 'essential')?.price_year_eur
  return year ? n(year / 12, { style: 'currency', currency: 'EUR' }) : null
})
</script>

<template>
  <div class="pricing">
    <h1 tabindex="-1">{{ t('pricing.title') }}</h1>
    <p class="lead">{{ t('pricing.lead') }}</p>
    <p class="notice" role="note">{{ t('pricing.trial') }}</p>

    <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="error" role="alert">{{ t('pricing.loadError') }}</p>
    <PlanPicker v-else-if="plans" :plans="plans" mode="public" :heading-level="2" />

    <section class="compare card" aria-labelledby="compare-title">
      <h2 id="compare-title">{{ t('pricing.compare.title') }}</h2>
      <p class="hint">{{ t('pricing.compare.intro') }}</p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">
            {{
              t('pricing.compare.caption')
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ t('pricing.compare.need') }}</th>
              <th scope="col">{{ t('pricing.compare.tool') }}</th>
              <th scope="col" class="num">{{ t('pricing.compare.price') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in WITHOUT" :key="row.need">
              <th scope="row">{{ t(`pricing.compare.needs.${row.need}`) }}</th>
              <td>{{ row.tool }}</td>
              <td class="num">{{ usd(row.usd) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colspan="2">{{ t('pricing.compare.without') }}</th>
              <td class="num">
                <del>
                  <span class="visually-hidden">{{ t('pricing.compare.struck') }}</span>
                  {{ usd(totalUsd) }}
                </del>
              </td>
            </tr>
            <tr v-if="withPann" class="with">
              <th scope="row" colspan="2">{{ t('pricing.compare.with') }}</th>
              <td class="num">{{ t('pricing.compare.withPrice', { price: withPann }) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="source">{{ t('pricing.compare.source') }}</p>
    </section>
  </div>
</template>

<style scoped>
.pricing {
  display: grid;
  gap: var(--space-5);
  max-width: 64rem;
  margin: 0 auto;
}

.pricing h1 {
  margin: 0;
}

.lead {
  margin: 0;
  font-size: 1.125rem;
}

.pricing > .notice {
  margin: 0;
}

.compare {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
}

.compare h2 {
  margin: 0;
}

.compare p {
  margin: 0;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
  text-align: start;
}

.num {
  text-align: end;
  font-variant-numeric: tabular-nums;
}

tfoot th,
tfoot td {
  font-weight: 750;
}

.with th,
.with td {
  border-bottom: 0;
  font-size: 1.125rem;
}

.source {
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}
</style>
