<script setup lang="ts">
/**
 * The offer of a workspace: its limits, where its payment stands and, when Pann provides
 * the AI, the tokens used this month (tokens only, never dollars). Its owner subscribes here,
 * or manages the subscription in Stripe's customer portal.
 */
import { trialDaysLeft, type BillingInterval, type Plan } from '@pann/shared'
import { useQuery, useQueryCache } from '@pinia/colada'
import { computed, onMounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../lib/api'
import { goToBilling } from '../lib/billing'
import { describeError } from '../lib/errors'
import { toast } from '../lib/toast'
import Icon from './Icon.vue'
import PlanPicker from './PlanPicker.vue'

const props = defineProps<{ workspaceId: string; isOwner: boolean }>()
const { t, n, d } = useI18n()
const id = useId()
const route = useRoute()
const router = useRouter()
const queryCache = useQueryCache()

const { data: plan } = useQuery({
  key: () => ['workspace-plan', props.workspaceId],
  query: () => api.workspacePlan(props.workspaceId),
})
const { data: plans } = useQuery({ key: ['public-plans'], query: api.publicPlans })

const tokens = (value: number) => n(value, { notation: 'compact', maximumFractionDigits: 1 })
const date = (value: string | null) => (value ? d(new Date(value), { dateStyle: 'long' }) : '')
const provided = computed(() => plan.value?.monthly_tokens != null)

const status = computed(() => {
  const p = plan.value
  if (!p) return null
  switch (p.billing_status) {
    case 'trialing':
      return {
        tone: 'accent',
        text: t('billing.trialing', {
          days: trialDaysLeft(p.trial_ends_at),
          date: date(p.trial_ends_at),
        }),
      }
    case 'active':
      return {
        tone: 'success',
        text: t(`billing.active.${p.billing_interval ?? 'month'}`, {
          date: date(p.current_period_end),
        }),
      }
    case 'canceled':
      return { tone: 'accent', text: t('billing.canceled', { date: date(p.current_period_end) }) }
    case 'past_due':
      return { tone: 'danger', text: t('billing.pastDue') }
    case 'expired':
      return { tone: 'danger', text: t('billing.expired') }
    default:
      return null
  }
})

const choosing = ref(false)
const busy = ref(false)
async function subscribe(planKey: Plan, interval: BillingInterval) {
  busy.value = true
  const error = await goToBilling(props.workspaceId, {
    kind: 'checkout',
    plan: planKey,
    interval,
    return_path: '/profile',
  })
  busy.value = false
  if (error) toast(describeError(error, t).text)
}
async function manage() {
  busy.value = true
  const error = await goToBilling(props.workspaceId, { kind: 'portal', return_path: '/profile' })
  busy.value = false
  if (error) toast(describeError(error, t).text)
}

// Back from Stripe: say how it went; the webhook may take a moment to update the offer.
onMounted(() => {
  const outcome = route.query.billing
  if (outcome !== 'success' && outcome !== 'cancel') return
  toast(outcome === 'success' ? t('billing.thanks') : t('billing.cancelled'))
  void router.replace({ query: { ...route.query, billing: undefined } })
  if (outcome === 'success')
    setTimeout(
      () => queryCache.invalidateQueries({ key: ['workspace-plan', props.workspaceId] }),
      3000,
    )
})
</script>

<template>
  <div v-if="plan" :id="`offer-${workspaceId}`" class="plan">
    <p class="label-row">
      <span class="plan-label">{{ t('plans.label') }}</span>
      <span class="badge" data-tone="accent">{{ t(`plans.names.${plan.plan}`) }}</span>
    </p>
    <p
      v-if="status"
      :class="status.tone === 'danger' ? 'notice notice-inline' : 'status'"
      :data-tone="status.tone === 'danger' ? 'danger' : undefined"
    >
      <Icon v-if="status.tone === 'danger'" name="alert-circle" />
      <span>{{ status.text }}</span>
    </p>
    <ul class="limits">
      <li>
        {{
          plan.max_topics === null
            ? t('plans.topicsUnlimited', { used: plan.topics })
            : t('plans.topics', { used: plan.topics, max: plan.max_topics })
        }}
      </li>
      <li v-if="!provided">{{ t('plans.ownKeys') }}</li>
    </ul>
    <template v-if="provided">
      <p class="tokens">
        {{
          t('plans.tokens', {
            used: tokens(plan.month_tokens),
            max: tokens(plan.monthly_tokens ?? 0),
          })
        }}
      </p>
      <meter
        class="meter"
        min="0"
        :max="plan.monthly_tokens ?? 1"
        :low="(plan.monthly_tokens ?? 0) * 0.7"
        :high="(plan.monthly_tokens ?? 0) * 0.9"
        :optimum="0"
        :value="plan.month_tokens"
        :aria-label="
          t('plans.tokens', {
            used: tokens(plan.month_tokens),
            max: tokens(plan.monthly_tokens ?? 0),
          })
        "
      ></meter>
      <p class="hint">
        {{
          plan.billing_status === 'trialing' ? t('plans.trialTokensHint') : t('plans.tokensHint')
        }}
      </p>
    </template>

    <div v-if="isOwner && plan.plan !== 'custom'" class="actions">
      <button
        v-if="plan.subscribed"
        type="button"
        class="button"
        data-size="small"
        :disabled="busy"
        @click="manage"
      >
        {{ t('billing.manage') }}
      </button>
      <button
        v-else
        type="button"
        class="button"
        :data-variant="plan.billing_status === 'legacy' ? undefined : 'primary'"
        data-size="small"
        :aria-expanded="choosing"
        :aria-controls="`${id}-picker`"
        @click="choosing = !choosing"
      >
        {{ t('billing.choose') }}
      </button>
      <p v-if="busy" role="status" class="hint">{{ t('billing.opening') }}</p>
    </div>
    <div v-if="choosing && !plan.subscribed && plans" :id="`${id}-picker`" class="picker">
      <PlanPicker
        :plans="plans"
        mode="subscribe"
        :current="plan.plan"
        :busy="busy"
        @choose="subscribe"
      />
    </div>
    <p class="hint">{{ t('plans.change') }}</p>
  </div>
</template>

<style scoped>
.plan {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.plan p {
  margin: 0;
}

.label-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.plan-label {
  font-weight: 650;
}

.limits {
  margin: 0;
  padding-inline-start: var(--space-5);
}

.meter {
  width: 100%;
  height: 0.75rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.picker {
  margin-top: var(--space-2);
}
</style>
