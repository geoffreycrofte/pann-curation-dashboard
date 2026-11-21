<script setup lang="ts">
/**
 * The offers side by side, with the period of payment. Used by the pricing page (to ask for
 * an account), the onboarding (to pick the offer of the trial) and the Profile (to subscribe).
 */
import { SELF_SERVE_PLANS, type BillingInterval, type Plan, type PublicPlan } from '@pann/shared'
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { session } from '../lib/session'

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
    <fieldset class="period">
      <legend>{{ t('pricing.period') }}</legend>
      <label class="period-option">
        <input v-model="interval" type="radio" :name="`${id}-period`" value="year" />
        {{ t('pricing.yearly') }}
        <span class="badge" data-tone="success">{{ t('pricing.yearlySaving') }}</span>
      </label>
      <label class="period-option">
        <input v-model="interval" type="radio" :name="`${id}-period`" value="month" />
        {{ t('pricing.monthly') }}
      </label>
    </fieldset>

    <ul class="offers">
      <li
        v-for="plan in offers"
        :key="plan.key"
        class="offer card"
        :data-current="plan.key === current || undefined"
        :aria-labelledby="`${id}-${plan.key}`"
      >
        <component :is="`h${headingLevel ?? 3}`" :id="`${id}-${plan.key}`" class="offer-name">
          {{ t(`plans.names.${plan.key}`) }}
          <span v-if="plan.key === current" class="badge" data-tone="accent">
            {{ t('pricing.current') }}
          </span>
        </component>
        <p class="offer-pitch">{{ t(`pricing.pitch.${plan.key}`) }}</p>
        <p v-if="price(plan)" class="offer-price">
          <span class="amount">{{ price(plan)!.perMonth }}</span>
          <span class="per">{{ t('pricing.perMonth') }}</span>
          <span class="note">{{ price(plan)!.note }}</span>
        </p>
        <ul class="features">
          <li>
            {{
              plan.max_topics === null
                ? t('pricing.topicsUnlimited')
                : t('pricing.topics', plan.max_topics)
            }}
          </li>
          <li v-if="plan.monthly_tokens === null">{{ t('pricing.ownKeys') }}</li>
          <template v-else>
            <li>{{ t('pricing.tokens', { tokens: tokens(plan.monthly_tokens) }) }}</li>
            <li v-if="plan.max_social_accounts !== null">
              {{ t('pricing.accounts', plan.max_social_accounts) }}
            </li>
          </template>
          <li>{{ t('pricing.everything') }}</li>
        </ul>
        <RouterLink
          v-if="mode === 'public'"
          :to="signedIn ? { name: 'profile' } : { name: 'request-access' }"
          class="button"
          :data-variant="plan.key === 'essential' ? 'primary' : undefined"
        >
          {{ signedIn ? t('pricing.fromProfile') : t('pricing.ask') }}
        </RouterLink>
        <button
          v-else
          type="button"
          class="button"
          :data-variant="plan.key === 'essential' && plan.key !== current ? 'primary' : undefined"
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
  gap: var(--space-5);
}

.period {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-5);
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

.period-option {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 2.75rem;
}

.offers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr));
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.offer {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
}

.offer[data-current] {
  border: 2px solid var(--color-text);
}

.offer-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: 1.25rem;
}

.offer-pitch {
  margin: 0;
  color: var(--color-text-muted);
}

.offer-price {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--space-2);
  margin: 0;
}

.amount {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.per {
  font-weight: 600;
}

.note {
  flex-basis: 100%;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.features {
  display: grid;
  align-content: start;
  gap: var(--space-1);
  margin: 0;
  padding-inline-start: var(--space-5);
  flex: 1;
}

.offer > .button {
  align-self: flex-start;
}
</style>
