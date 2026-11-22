<script setup lang="ts">
/**
 * Admin space: the limits of each offer. An empty field means no limit; on the own-keys
 * offer there are no tokens (the workspace pays its own services).
 */
import type { Plan, PlanLimits } from '@glimr/shared'
import { useQuery, useQueryCache } from '@pinia/colada'
import { reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type AdminPlan } from '../../lib/api'
import { describeError } from '../../lib/errors'
import { toast } from '../../lib/toast'

const { t, n } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const { data: plans } = useQuery({ key: ['admin', 'plans'], query: api.adminPlans })

/** Fields as typed, per plan; '' is no limit (or not sold that way, for prices). */
type Fields = Record<
  keyof PlanLimits | 'price_month_eur' | 'price_year_eur' | 'trial_tokens',
  number | ''
> & { stripe_price_month: string; stripe_price_year: string }
const fields = reactive<Partial<Record<Plan, Fields>>>({})
watch(
  plans,
  (list) => {
    for (const p of list ?? []) {
      fields[p.key] = {
        max_topics: p.max_topics ?? '',
        max_social_accounts: p.max_social_accounts ?? '',
        monthly_tokens: p.monthly_tokens ?? '',
        price_month_eur: p.price_month_eur ?? '',
        price_year_eur: p.price_year_eur ?? '',
        trial_tokens: p.trial_tokens ?? '',
        stripe_price_month: p.stripe_price_month,
        stripe_price_year: p.stripe_price_year,
      }
    }
  },
  { immediate: true },
)

const editable = (p: AdminPlan) => p.key !== 'custom'
const eur = (value: number) =>
  n(value, { style: 'currency', currency: 'EUR', maximumFractionDigits: value % 1 ? 2 : 0 })
/** The saved prices, said in one line next to the offer's name. */
function summary(p: AdminPlan) {
  const parts = [
    p.price_month_eur !== null ? t('admin.plans.perMonth', { price: eur(p.price_month_eur) }) : '',
    p.price_year_eur !== null ? t('admin.plans.perYear', { price: eur(p.price_year_eur) }) : '',
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : t('admin.plans.notSold')
}
/** Every price it is sold at has its Stripe price: it can be paid. */
const payable = (p: AdminPlan) =>
  (p.price_month_eur !== null || p.price_year_eur !== null) &&
  (p.price_month_eur === null || !!p.stripe_price_month) &&
  (p.price_year_eur === null || !!p.stripe_price_year)
const saving = ref<Plan | null>(null)
async function save(key: Plan) {
  const f = fields[key]
  if (!f) return
  const value = (v: number | '') => (v === '' ? null : Number(v))
  saving.value = key
  try {
    await api.adminUpdatePlan(key, {
      max_topics: value(f.max_topics),
      max_social_accounts: value(f.max_social_accounts),
      monthly_tokens: key === 'own_keys' ? null : value(f.monthly_tokens),
      price_month_eur: value(f.price_month_eur),
      price_year_eur: value(f.price_year_eur),
      trial_tokens: key === 'own_keys' ? null : value(f.trial_tokens),
      stripe_price_month: f.stripe_price_month.trim(),
      stripe_price_year: f.stripe_price_year.trim(),
    })
    toast(t('admin.plans.saved', { plan: t(`plans.names.${key}`) }))
    await queryCache.invalidateQueries({ key: ['admin', 'plans'] })
  } catch (err) {
    toast(describeError((err as Error).message, t).text)
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <section class="section-card block" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`" class="section-title">{{ t('admin.plans.title') }}</h2>
    <p class="hint">{{ t('admin.plans.intro') }}</p>
    <ul class="plans">
      <li v-for="p in (plans ?? []).filter(editable)" :key="p.key" class="plan">
        <form v-if="fields[p.key]" @submit.prevent="save(p.key)">
          <header class="plan-head">
            <h3 :id="`${id}-${p.key}`">{{ t(`plans.names.${p.key}`) }}</h3>
            <span class="plan-summary">{{ summary(p) }}</span>
            <span class="badge" data-dot :data-tone="payable(p) ? 'success' : 'danger'">
              {{ payable(p) ? t('admin.plans.payable') : t('admin.plans.notPayable') }}
            </span>
          </header>

          <div class="groups">
            <div class="group" role="group" :aria-labelledby="`${id}-${p.key}-limits`">
              <h4 :id="`${id}-${p.key}-limits`" class="group-title">
                {{ t('admin.plans.groups.limits') }}
              </h4>
              <div class="form-row">
                <label :for="`${id}-${p.key}-topics`">{{ t('admin.plans.maxTopics') }}</label>
                <input
                  :id="`${id}-${p.key}-topics`"
                  v-model.number="fields[p.key]!.max_topics"
                  class="field"
                  type="number"
                  min="1"
                  step="1"
                  :aria-describedby="`${id}-empty`"
                />
              </div>
              <div class="form-row">
                <label :for="`${id}-${p.key}-accounts`">{{ t('admin.plans.maxAccounts') }}</label>
                <input
                  :id="`${id}-${p.key}-accounts`"
                  v-model.number="fields[p.key]!.max_social_accounts"
                  class="field"
                  type="number"
                  min="1"
                  step="1"
                  :aria-describedby="`${id}-empty`"
                />
              </div>
            </div>

            <div
              v-if="p.key !== 'own_keys'"
              class="group"
              role="group"
              :aria-labelledby="`${id}-${p.key}-tokens-title`"
            >
              <h4 :id="`${id}-${p.key}-tokens-title`" class="group-title">
                {{ t('admin.plans.groups.tokens') }}
              </h4>
              <div class="form-row">
                <label :for="`${id}-${p.key}-tokens`">{{ t('admin.plans.perMonthShort') }}</label>
                <input
                  :id="`${id}-${p.key}-tokens`"
                  v-model.number="fields[p.key]!.monthly_tokens"
                  class="field"
                  type="number"
                  min="1"
                  step="100000"
                  required
                />
              </div>
              <div class="form-row">
                <label :for="`${id}-${p.key}-trial`">{{ t('admin.plans.duringTrial') }}</label>
                <input
                  :id="`${id}-${p.key}-trial`"
                  v-model.number="fields[p.key]!.trial_tokens"
                  class="field"
                  type="number"
                  min="1"
                  step="100000"
                />
              </div>
            </div>

            <div class="group" role="group" :aria-labelledby="`${id}-${p.key}-prices`">
              <h4 :id="`${id}-${p.key}-prices`" class="group-title">
                {{ t('admin.plans.groups.prices') }}
              </h4>
              <div class="form-row">
                <label :for="`${id}-${p.key}-pm`">{{ t('admin.plans.perMonthShort') }}</label>
                <input
                  :id="`${id}-${p.key}-pm`"
                  v-model.number="fields[p.key]!.price_month_eur"
                  class="field"
                  type="number"
                  min="0"
                  step="0.01"
                  :aria-describedby="`${id}-empty`"
                />
              </div>
              <div class="form-row">
                <label :for="`${id}-${p.key}-py`">{{ t('admin.plans.perYearShort') }}</label>
                <input
                  :id="`${id}-${p.key}-py`"
                  v-model.number="fields[p.key]!.price_year_eur"
                  class="field"
                  type="number"
                  min="0"
                  step="0.01"
                  :aria-describedby="`${id}-empty`"
                />
              </div>
            </div>

            <div class="group" role="group" :aria-labelledby="`${id}-${p.key}-stripe`">
              <h4 :id="`${id}-${p.key}-stripe`" class="group-title">
                {{ t('admin.plans.groups.stripe') }}
              </h4>
              <div class="form-row">
                <label :for="`${id}-${p.key}-spm`">{{ t('admin.plans.perMonthShort') }}</label>
                <input
                  :id="`${id}-${p.key}-spm`"
                  v-model="fields[p.key]!.stripe_price_month"
                  class="field mono"
                  type="text"
                  pattern="price_[A-Za-z0-9]+"
                  placeholder="price_…"
                  spellcheck="false"
                  :aria-describedby="`${id}-stripe`"
                />
              </div>
              <div class="form-row">
                <label :for="`${id}-${p.key}-spy`">{{ t('admin.plans.perYearShort') }}</label>
                <input
                  :id="`${id}-${p.key}-spy`"
                  v-model="fields[p.key]!.stripe_price_year"
                  class="field mono"
                  type="text"
                  pattern="price_[A-Za-z0-9]+"
                  placeholder="price_…"
                  spellcheck="false"
                  :aria-describedby="`${id}-stripe`"
                />
              </div>
            </div>
          </div>

          <div class="plan-actions">
            <button
              type="submit"
              class="button"
              data-variant="primary"
              data-size="small"
              :disabled="saving === p.key"
              :aria-describedby="`${id}-${p.key}`"
            >
              {{ t('common.save') }}
            </button>
          </div>
        </form>
      </li>
    </ul>
    <p :id="`${id}-empty`" class="hint">{{ t('admin.plans.emptyHint') }}</p>
    <p :id="`${id}-stripe`" class="hint">{{ t('admin.plans.stripeHint') }}</p>
  </section>
</template>

<style scoped>
.plans {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* One tile per offer, on the page's background: set apart from the card around it. */
.plan form {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-bg);
}

.plan-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-3);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
}

.plan-head h3 {
  margin: 0;
  font-size: 1.25rem;
}

.plan-summary {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.plan-head .badge {
  margin-inline-start: auto;
}

/* Limits, tokens, prices, Stripe: side by side on a wide screen, one under the other otherwise. */
.groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr));
  gap: var(--space-4) var(--space-6);
}

.group {
  display: grid;
  align-content: start;
  gap: var(--space-3);
}

.group-title {
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.group .field {
  width: 100%;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9375rem;
}

.plan-actions {
  display: flex;
  justify-content: flex-end;
}

p {
  margin: 0;
}
</style>
