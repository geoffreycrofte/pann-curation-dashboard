<script setup lang="ts">
/**
 * Public pricing page: the offers, then what the same work costs with separate tools.
 * The competitors' prices were read on their pages in November 2026 and are given as
 * examples only (docs/studies/tarifs-concurrence.md).
 */
import { useQuery } from '@pinia/colada'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '../components/Icon.vue'
import PlanPicker from '../components/PlanPicker.vue'
import { api } from '../lib/api'
import { session } from '../lib/session'

const { t, n } = useI18n()
const {
  data: plans,
  isPending,
  error,
} = useQuery({ key: ['public-plans'], query: api.publicPlans })

/** Without Pann, for one person, yearly prices per month (USD, as the vendors show them). */
const WITHOUT = [
  { need: 'publish', tool: 'Publer Business', usd: 24, icon: 'send' },
  { need: 'watch', tool: 'Feedly Pro+', usd: 12, icon: 'news' },
  { need: 'listen', tool: 'Syften Standard', usd: 49.95, icon: 'messages' },
] as const
/** What the Pann offer includes, said next to its price. */
const INCLUDED = ['publish', 'watch', 'listen', 'create'] as const
/** What separate tools cost besides their price. */
const DRAWBACKS = ['bills', 'silos', 'ai'] as const
const totalUsd = WITHOUT.reduce((sum, row) => sum + row.usd, 0)
const usd = (value: number) => n(value, { style: 'currency', currency: 'USD' })
/** With Pann: the intermediate offer, paid yearly. */
const pannMonth = computed(() => {
  const year = plans.value?.find((p) => p.key === 'essential')?.price_year_eur
  return year ? year / 12 : null
})
const withPann = computed(() =>
  pannMonth.value === null
    ? null
    : n(pannMonth.value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }),
)
/** Width of Pann's bar, on the scale of the separate tools (at least visible). */
const share = computed(() =>
  pannMonth.value === null ? 0 : Math.max(4, Math.round((pannMonth.value / totalUsd) * 100)),
)
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

    <section class="compare" aria-labelledby="compare-title">
      <h2 id="compare-title">{{ t('pricing.compare.title') }}</h2>
      <p class="compare-intro">{{ t('pricing.compare.intro') }}</p>

      <div class="sides">
        <article class="side without card" aria-labelledby="without-title">
          <h3 id="without-title" class="side-title">
            {{ t('pricing.compare.without') }}
            <span class="side-sub">{{ t('pricing.compare.withoutSub') }}</span>
          </h3>
          <ul class="tools">
            <li v-for="row in WITHOUT" :key="row.need" :data-need="row.need">
              <span class="tool-icon"><Icon :name="row.icon" :size="20" /></span>
              <span class="tool-text">
                <span class="need">{{ t(`pricing.compare.needs.${row.need}`) }}</span>
                <span class="tool">{{ row.tool }}</span>
              </span>
              <span class="tool-price">{{ usd(row.usd) }}</span>
            </li>
          </ul>
          <!-- The bar shows the same figures as the list: decorative. -->
          <div class="scale" aria-hidden="true">
            <span
              v-for="row in WITHOUT"
              :key="row.need"
              class="part"
              :data-need="row.need"
              :style="{ flexGrow: row.usd }"
            ></span>
          </div>
          <p class="total">
            <span class="total-label">{{ t('pricing.compare.total') }}</span>
            <del class="total-price">
              <span class="visually-hidden">{{ t('pricing.compare.struck') }}</span>
              {{ usd(totalUsd) }}
            </del>
            <span class="per">{{ t('pricing.perMonth') }}</span>
          </p>
          <ul class="drawbacks">
            <li v-for="key in DRAWBACKS" :key="key">
              <Icon name="minus" :size="18" class="minus" />
              <span>{{ t(`pricing.compare.drawbacks.${key}`) }}</span>
            </li>
          </ul>
        </article>

        <p class="versus" aria-hidden="true">{{ t('pricing.compare.versus') }}</p>

        <article class="side with" aria-labelledby="with-title">
          <h3 id="with-title" class="side-title">
            {{ t('pricing.compare.with') }}
            <span class="side-sub">{{ t('pricing.compare.withSub') }}</span>
          </h3>
          <p v-if="withPann" class="with-price">
            <span class="amount">{{ withPann }}</span>
            <span class="per">{{ t('pricing.perMonth') }}</span>
          </p>
          <p class="with-note">{{ t('pricing.compare.withNote') }}</p>
          <div class="scale" aria-hidden="true">
            <span class="part pann" :style="{ width: `${share}%` }"></span>
          </div>
          <ul class="included">
            <li v-for="key in INCLUDED" :key="key">
              <Icon name="check" :size="18" class="check" />
              <span>{{ t(`pricing.compare.included.${key}`) }}</span>
            </li>
          </ul>
          <RouterLink
            :to="session ? { name: 'profile' } : { name: 'request-access' }"
            class="button"
            data-variant="primary"
          >
            {{ session ? t('pricing.fromProfile') : t('pricing.compare.cta') }}
          </RouterLink>
        </article>
      </div>
      <p class="source">{{ t('pricing.compare.source') }}</p>
    </section>
  </div>
</template>

<style scoped>
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

/* Without Pann, with Pann. */
.compare {
  display: grid;
  gap: var(--space-4);
}

.compare h2 {
  margin: 0;
  font-size: clamp(1.75rem, 4vw, 2.25rem);
  text-align: center;
}

.compare-intro {
  max-width: 40rem;
  margin: 0 auto;
  color: var(--color-text-muted);
  text-align: center;
}

.sides {
  display: grid;
  gap: var(--space-4);
  align-items: stretch;
}

@media (min-width: 52rem) {
  .sides {
    grid-template-columns: 1fr auto 1fr;
  }
}

.side {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
}

.side-title {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  font-size: 1.5rem;
}

.side-sub {
  color: var(--color-text-muted);
  font-family: var(--font-sans);
  font-size: 1rem;
  font-weight: 600;
}

.tools {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tools li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-3);
}

.tool-icon {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius);
}

[data-need='publish'] .tool-icon {
  background: var(--color-kind-publication-soft);
  color: var(--color-kind-publication);
}

[data-need='watch'] .tool-icon {
  background: var(--color-neutral-soft);
  color: var(--color-text);
}

[data-need='listen'] .tool-icon {
  background: var(--color-kind-conversation-soft);
  color: var(--color-kind-conversation);
}

.tool-text {
  display: grid;
}

.need {
  font-weight: 650;
}

.tool {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.tool-price {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* Bars: the same scale on both sides, so Pann's is a fraction of the other. */
.scale {
  display: flex;
  flex: none;
  gap: 3px;
  height: 0.875rem;
}

.part {
  height: 100%;
  min-width: 0;
}

.part:first-child {
  border-start-start-radius: var(--radius-pill);
  border-end-start-radius: var(--radius-pill);
}

.part:last-child {
  border-start-end-radius: var(--radius-pill);
  border-end-end-radius: var(--radius-pill);
}

.part[data-need] {
  flex-basis: 0;
}

.part[data-need='publish'] {
  background: var(--color-kind-publication);
}

.part[data-need='watch'] {
  background: var(--color-neutral-fill);
}

.part[data-need='listen'] {
  background: var(--color-kind-conversation);
}

/* Pann's bar on a faint track the width of the other side's bar. */
.with .scale {
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--color-on-ink) 15%, transparent);
}

.part.pann {
  flex: none;
  border-radius: var(--radius-pill);
  background: var(--color-accent-fill);
}

.total {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  margin: 0;
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border-subtle);
}

.drawbacks {
  display: grid;
  gap: var(--space-2);
  margin: auto 0 0;
  padding: var(--space-4) 0 0;
  list-style: none;
  color: var(--color-text-muted);
}

.drawbacks li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.minus {
  flex: none;
  margin-top: 0.15em;
  color: var(--color-danger);
}

.total-label {
  font-weight: 650;
}

.total-price {
  margin-inline-start: auto;
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 800;
  text-decoration-color: var(--color-danger);
  text-decoration-thickness: 3px;
}

.per {
  font-weight: 600;
}

.versus {
  display: grid;
  place-items: center;
  align-self: center;
  justify-self: center;
  width: 3.5rem;
  height: 3.5rem;
  margin: 0;
  border-radius: 50%;
  background: var(--color-text);
  color: var(--color-surface);
  font-family: var(--font-display);
  font-weight: 800;
}

/* With Pann: the ink card of the featured offer, gold edge. */
.with {
  border: 2px solid var(--color-accent-fill);
  background: var(--color-ink);
  color: var(--color-on-ink);
  box-shadow: var(--shadow-raised);
}

.with .side-sub,
.with-note {
  color: var(--color-on-ink-muted);
}

.with-price {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin: 0;
}

.with-price .amount {
  color: var(--color-accent-on-ink);
  font-family: var(--font-display);
  font-size: 3rem;
  font-weight: 800;
  line-height: 1;
}

.with-note {
  margin: 0;
  font-size: 0.875rem;
}

.included {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.included li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.check {
  flex: none;
  margin-top: 0.15em;
  color: var(--color-accent-on-ink);
}

.with .button {
  margin-top: auto;
  justify-content: center;
}

.with :focus-visible {
  outline-color: var(--color-focus-on-ink);
}

.source {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  text-align: center;
}
</style>
