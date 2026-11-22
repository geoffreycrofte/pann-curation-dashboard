<script setup lang="ts">
/**
 * The offers side by side, with the period of payment. Used by the pricing page (to ask for
 * an account), the onboarding (to pick the offer of the trial) and the Profile (to subscribe).
 */
import { SELF_SERVE_PLANS, type BillingInterval, type Plan, type PublicPlan } from '@glimr/shared'
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { session } from '../lib/session'
import Icon from './Icon.vue'

/** The offer put forward: the one most people should start with. */
const FEATURED: Plan = 'essential'

const props = defineProps<{
  plans: PublicPlan[]
  mode: 'public' | 'trial' | 'subscribe'
  /** The workspace's offer, marked as such. */
  current?: Plan
  busy?: boolean
  /** Heading level of each offer's name (the page's structure decides). */
  headingLevel?: 2 | 3
}>()
const emit = defineEmits<{ choose: [plan: Plan, interval: BillingInterval] }>()
const { t, n } = useI18n()
const id = useId()

/** Signed in, the pricing page leads to the Profile, where the offer is chosen. */
const signedIn = computed(() => !!session.value)
const interval = ref<BillingInterval>('year')
const offers = computed(() =>
  SELF_SERVE_PLANS.map((key) => props.plans.find((p) => p.key === key)).filter(
    (p): p is PublicPlan => !!p,
  ),
)
const eur = (value: number) =>
  n(value, { style: 'currency', currency: 'EUR', maximumFractionDigits: value % 1 ? 2 : 0 })
const tokens = (value: number) => n(value, { notation: 'compact', maximumFractionDigits: 1 })

/** Price per month for the chosen period; offers sold yearly only show their yearly price. */
function price(plan: PublicPlan) {
  const yearly = interval.value === 'year' || plan.price_month_eur === null
  if (yearly && plan.price_year_eur !== null)
    return {
      perMonth: eur(plan.price_year_eur / 12),
      note: t('pricing.billedYearly', { total: eur(plan.price_year_eur) }),
      interval: 'year' as const,
    }
  if (plan.price_month_eur !== null)
    return {
      perMonth: eur(plan.price_month_eur),
      note: t('pricing.billedMonthly'),
      interval: 'month' as const,
    }
  return null
}
</script>

<template>
  <div class="picker">
    <!-- Native radios in a pill: the chosen period is filled, bold and checked. -->
    <fieldset class="period">
      <legend>{{ t('pricing.period') }}</legend>
      <div class="period-options">
        <label class="period-option">
          <input v-model="interval" type="radio" :name="`${id}-period`" value="year" />
          {{ t('pricing.yearly') }}
        </label>
        <label class="period-option">
          <input v-model="interval" type="radio" :name="`${id}-period`" value="month" />
          {{ t('pricing.monthly') }}
        </label>
      </div>
      <span class="badge" data-tone="success">{{ t('pricing.yearlySaving') }}</span>
    </fieldset>

    <ul class="offers">
      <li
        v-for="plan in offers"
        :key="plan.key"
        class="offer card"
        :data-current="plan.key === current || undefined"
        :data-featured="plan.key === FEATURED || undefined"
        :aria-labelledby="`${id}-${plan.key}`"
      >
        <component :is="`h${headingLevel ?? 3}`" :id="`${id}-${plan.key}`" class="offer-name">
          {{ t(`plans.names.${plan.key}`) }}
          <span v-if="plan.key === current" class="badge" data-tone="accent">
            {{ t('pricing.current') }}
          </span>
        </component>
        <!-- Shown as a ribbon on the card's edge; read right after the offer's name. -->
        <p v-if="plan.key === FEATURED" class="ribbon">
          <Icon name="sparkles" :size="16" />
          {{ t('pricing.recommended') }}
        </p>
        <p class="offer-pitch">{{ t(`pricing.pitch.${plan.key}`) }}</p>
        <p v-if="price(plan)" class="offer-price">
          <span class="amount">{{ price(plan)!.perMonth }}</span>
          <span class="per">{{ t('pricing.perMonth') }}</span>
          <span class="note">{{ price(plan)!.note }}</span>
        </p>
        <ul class="features">
          <li>
            <Icon name="check" :size="18" class="check" />
            <span>{{
              plan.max_topics === null
                ? t('pricing.topicsUnlimited')
                : t('pricing.topics', plan.max_topics)
            }}</span>
          </li>
          <li v-if="plan.monthly_tokens === null">
            <Icon name="check" :size="18" class="check" />
            <span>{{ t('pricing.ownKeys') }}</span>
          </li>
          <template v-else>
            <li>
              <Icon name="check" :size="18" class="check" />
              <span>{{ t('pricing.tokens', { tokens: tokens(plan.monthly_tokens) }) }}</span>
            </li>
            <li v-if="plan.max_social_accounts !== null">
              <Icon name="check" :size="18" class="check" />
              <span>{{ t('pricing.accounts', plan.max_social_accounts) }}</span>
            </li>
          </template>
          <li>
            <Icon name="check" :size="18" class="check" />
            <span>{{ t('pricing.everything') }}</span>
          </li>
        </ul>
        <RouterLink
          v-if="mode === 'public'"
          :to="signedIn ? { name: 'profile' } : { name: 'request-access' }"
          class="button"
          :data-variant="plan.key === FEATURED ? 'primary' : undefined"
        >
          {{ signedIn ? t('pricing.fromProfile') : t('pricing.ask') }}
        </RouterLink>
        <button
          v-else
          type="button"
          class="button"
          :data-variant="plan.key === FEATURED && plan.key !== current ? 'primary' : undefined"
          :disabled="busy || (mode === 'trial' && plan.key === current)"
          :aria-describedby="`${id}-${plan.key}`"
          @click="emit('choose', plan.key, price(plan)?.interval ?? interval)"
        >
          {{
            mode === 'trial'
              ? plan.key === current
                ? t('pricing.chosen')
                : t('pricing.choose')
              : t('pricing.subscribe')
          }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.picker {
  display: grid;
  gap: var(--space-6);
}

/* Period: two radios in a pill, centred above the offers. */
.period {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-2) var(--space-3);
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
}

.period legend {
  float: left;
  margin-inline-end: var(--space-2);
  padding: 0;
  font-weight: 650;
}

.period-options {
  display: inline-flex;
  padding: var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
}

.period-option {
  display: inline-flex;
  align-items: center;
  min-height: 2.5rem;
  padding: 0 var(--space-4);
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-weight: 600;
}

.period-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.period-option:has(input:checked) {
  background: var(--color-text);
  color: var(--color-surface);
  font-weight: 750;
}

.period-option:has(input:focus-visible) {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.offers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
  align-items: stretch;
  gap: var(--space-5) var(--space-4);
  margin: 0;
  /* Room for the ribbon of the featured offer. */
  padding: var(--space-4) 0 0;
  list-style: none;
}

.offer {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-5) var(--space-5);
}

.offer[data-current] {
  border: 2px solid var(--color-text);
}

/* The featured offer: ink card, gold edge, raised above the others on wide screens. */
.offer[data-featured] {
  border: 2px solid var(--color-accent-fill);
  background: var(--color-ink);
  color: var(--color-on-ink);
  box-shadow: var(--shadow-raised);
}

@media (min-width: 60rem) {
  .offer[data-featured] {
    transform: translateY(calc(-1 * var(--space-3)));
  }
}

.offer[data-featured] :focus-visible {
  outline-color: var(--color-focus-on-ink);
}

.ribbon {
  position: absolute;
  top: 0;
  left: 50%;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin: 0;
  padding: var(--space-1) var(--space-4);
  border-radius: var(--radius-pill);
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
  font-size: 0.875rem;
  font-weight: 750;
  white-space: nowrap;
  transform: translate(-50%, -50%);
}

.offer-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: 1.375rem;
}

.offer-pitch {
  margin: 0;
  color: var(--color-text-muted);
}

.offer[data-featured] .offer-pitch,
.offer[data-featured] .note {
  color: var(--color-on-ink-muted);
}

.offer-price {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--space-2);
  margin: 0;
  padding: var(--space-3) 0;
  border-block: 1px solid var(--color-border-subtle);
}

.offer[data-featured] .offer-price {
  border-color: color-mix(in srgb, var(--color-on-ink) 20%, transparent);
}

.amount {
  font-family: var(--font-display);
  font-size: 2.5rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.offer[data-featured] .amount {
  color: var(--color-accent-on-ink);
}

.per {
  font-weight: 600;
}

.note {
  flex-basis: 100%;
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.features {
  display: grid;
  align-content: start;
  gap: var(--space-2);
  flex: 1;
  margin: 0;
  padding: 0;
  list-style: none;
}

.features li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.check {
  flex: none;
  margin-top: 0.15em;
  color: var(--color-accent-text);
}

.offer[data-featured] .check {
  color: var(--color-accent-on-ink);
}

.offer > .button {
  align-self: stretch;
  justify-content: center;
}

/* On ink, the neutral button keeps a visible edge. */
.offer[data-featured] > .button:not([data-variant]) {
  border-color: var(--color-on-ink);
  color: var(--color-on-ink);
}
</style>
