<script setup lang="ts">
/**
 * Admin space: the limits of each offer. An empty field means no limit; on the own-keys
 * offer there are no tokens (the workspace pays its own services).
 */
import type { Plan, PlanLimits } from '@pann/shared'
import { useQuery, useQueryCache } from '@pinia/colada'
import { reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type AdminPlan } from '../../lib/api'
import { describeError } from '../../lib/errors'
import { toast } from '../../lib/toast'

const { t } = useI18n()
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
          <h3 :id="`${id}-${p.key}`">{{ t(`plans.names.${p.key}`) }}</h3>
          <div class="grid">
            <div class="form-row">
              <label :for="`${id}-${p.key}-topics`">{{ t('admin.plans.maxTopics') }}</label>
              <input
                :id="`${id}-${p.key}-topics`"
                v-model.number="fields[p.key]!.max_topics"
                class="field number"
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
                class="field number"
                type="number"
                min="1"
                step="1"
                :aria-describedby="`${id}-empty`"
              />
            </div>
            <div v-if="p.key !== 'own_keys'" class="form-row">
              <label :for="`${id}-${p.key}-tokens`">{{ t('admin.plans.monthlyTokens') }}</label>
              <input
                :id="`${id}-${p.key}-tokens`"
                v-model.number="fields[p.key]!.monthly_tokens"
                class="field number wide"
                type="number"
                min="1"
                step="100000"
                required
              />
            </div>
            <div v-if="p.key !== 'own_keys'" class="form-row">
              <label :for="`${id}-${p.key}-trial`">{{ t('admin.plans.trialTokens') }}</label>
              <input
                :id="`${id}-${p.key}-trial`"
                v-model.number="fields[p.key]!.trial_tokens"
                class="field number wide"
                type="number"
                min="1"
                step="100000"
              />
            </div>
            <div class="form-row">
              <label :for="`${id}-${p.key}-pm`">{{ t('admin.plans.priceMonth') }}</label>
              <input
                :id="`${id}-${p.key}-pm`"
                v-model.number="fields[p.key]!.price_month_eur"
                class="field number"
                type="number"
                min="0"
                step="0.01"
                :aria-describedby="`${id}-empty`"
              />
            </div>
            <div class="form-row">
              <label :for="`${id}-${p.key}-py`">{{ t('admin.plans.priceYear') }}</label>
              <input
                :id="`${id}-${p.key}-py`"
                v-model.number="fields[p.key]!.price_year_eur"
                class="field number"
                type="number"
                min="0"
                step="0.01"
                :aria-describedby="`${id}-empty`"
              />
            </div>
            <div class="form-row">
              <label :for="`${id}-${p.key}-spm`">{{ t('admin.plans.stripeMonth') }}</label>
              <input
                :id="`${id}-${p.key}-spm`"
                v-model="fields[p.key]!.stripe_price_month"
                class="field"
                type="text"
                pattern="price_[A-Za-z0-9]+"
                placeholder="price_…"
                :aria-describedby="`${id}-stripe`"
              />
            </div>
            <div class="form-row">
              <label :for="`${id}-${p.key}-spy`">{{ t('admin.plans.stripeYear') }}</label>
              <input
                :id="`${id}-${p.key}-spy`"
                v-model="fields[p.key]!.stripe_price_year"
                class="field"
                type="text"
                pattern="price_[A-Za-z0-9]+"
                placeholder="price_…"
                :aria-describedby="`${id}-stripe`"
              />
            </div>
          </div>
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

.plan + .plan {
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
}

.plan form {
  display: grid;
  gap: var(--space-3);
  justify-items: start;
}

.plan h3 {
  margin: 0;
  font-size: 1rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr));
  /* Fields line up even when a label wraps. */
  align-items: end;
  gap: var(--space-3);
  width: 100%;
}

.number {
  max-width: 8rem;
}

.number.wide {
  max-width: 11rem;
}

p {
  margin: 0;
}
</style>
