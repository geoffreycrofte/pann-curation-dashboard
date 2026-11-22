<script setup lang="ts">
/**
 * What the same work costs with separate tools, next to Glimr's intermediate offer paid
 * yearly. On the pricing page and at the end of "how it works". The competitors' prices
 * were read on their pages in November 2026 and are given as examples only
 * (docs/studies/tarifs-concurrence.md).
 */
import { useQuery } from '@pinia/colada'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { COMPETITORS } from '../lib/competitors'
import { session } from '../lib/session'
import Icon from './Icon.vue'

const { t, n } = useI18n()
const { data: plans } = useQuery({ key: ['public-plans'], query: api.publicPlans })
const WITHOUT = COMPETITORS

/** What the Glimr offer includes, said next to its price. */
const INCLUDED = ['publish', 'watch', 'listen', 'create'] as const
/** What separate tools cost besides their price. */
const DRAWBACKS = ['bills', 'silos', 'ai'] as const
const totalUsd = WITHOUT.reduce((sum, row) => sum + row.usd, 0)
const usd = (value: number) => n(value, { style: 'currency', currency: 'USD' })
/** With Glimr: the intermediate offer, paid yearly. */
const glimrMonth = computed(() => {
  const year = plans.value?.find((p) => p.key === 'essential')?.price_year_eur
  return year ? year / 12 : null
})
const withGlimr = computed(() =>
  glimrMonth.value === null
    ? null
    : n(glimrMonth.value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }),
)
/** Width of Glimr's bar, on the scale of the separate tools (at least visible). */
const share = computed(() =>
  glimrMonth.value === null ? 0 : Math.max(4, Math.round((glimrMonth.value / totalUsd) * 100)),
)
</script>

<template>
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
        <p v-if="withGlimr" class="with-price">
          <span class="amount">{{ withGlimr }}</span>
          <span class="per">{{ t('pricing.perMonth') }}</span>
        </p>
        <p class="with-note">{{ t('pricing.compare.withNote') }}</p>
        <div class="scale" aria-hidden="true">
          <span class="part glimr" :style="{ width: `${share}%` }"></span>
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
</template>

<style scoped>
/* Without Glimr, with Glimr. */
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

/* Bars: the same scale on both sides, so Glimr's is a fraction of the other. */
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

/* Glimr's bar on a faint track the width of the other side's bar. */
.with .scale {
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--color-on-ink) 15%, transparent);
}

.part.glimr {
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

/* With Glimr: the ink card of the featured offer, gold edge. */
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
