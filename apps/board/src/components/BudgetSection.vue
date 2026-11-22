<script setup lang="ts">
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { costToTokens, USD_PER_TOKEN } from '@glimr/shared'
import { api } from '../lib/api'
import { useWorkspace } from '../lib/workspace'
import { describeError } from '../lib/errors'
import Icon from './Icon.vue'

const props = defineProps<{ topicId: string }>()
const { t, n } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const { data: usage } = useQuery({
  key: () => ['usage', props.topicId],
  query: () => api.usage(props.topicId),
})

const budget = ref<number>()
watch(usage, (value) => {
  if (value && budget.value === undefined) budget.value = value.budget_usd
})
/** The cap as typed: tokens on offers where Glimr provides the AI. */
const budgetField = computed({
  get: () =>
    budget.value === undefined
      ? undefined
      : inTokens.value
        ? costToTokens(budget.value)
        : budget.value,
  set: (value: number | undefined) => {
    budget.value = value === undefined ? undefined : inTokens.value ? value * USD_PER_TOKEN : value
  },
})

const usd = (value: number) =>
  n(value, { style: 'currency', currency: 'USD', maximumFractionDigits: value < 1 ? 4 : 2 })

// On offers where Glimr provides the AI, amounts are tokens, never dollars.
const { workspaceId } = useWorkspace()
const { data: plan } = useQuery({
  key: () => ['workspace-plan', workspaceId.value ?? ''],
  query: () => api.workspacePlan(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})
const inTokens = computed(() => plan.value?.monthly_tokens != null)
const tokens = (value: number) =>
  t('settings.tokensAmount', {
    n: n(value, { notation: 'compact', maximumFractionDigits: value < 1000 ? 0 : 1 }),
  })
/** An amount spent: dollars on the own-keys offer, tokens otherwise. */
const money = (valueUsd: number) =>
  inTokens.value ? tokens(costToTokens(valueUsd)) : usd(valueUsd)
const operations = [
  'triage',
  'draft',
  'search',
  'other',
  'rewrite',
  'engagement_triage',
  'engagement_reply',
  'compose_search',
  'series_plan',
  'voice',
]
const label = (operation: string) =>
  t(`settings.operations.${operations.includes(operation) ? operation : 'other'}`)
/** Averages of the month: what a day and a post cost, and where the month is heading. */
const perDay = computed(() =>
  usage.value ? usage.value.month_cost_usd / Math.max(1, usage.value.days_elapsed) : 0,
)
const averages = computed(() => {
  const u = usage.value
  if (!u || !u.month_cost_usd) return []
  return [
    { key: 'perDay', value: money(perDay.value) },
    { key: 'projection', value: money(perDay.value * u.days_in_month) },
    ...(u.posts_drafted
      ? [{ key: 'perDrafted', value: money(u.month_cost_usd / u.posts_drafted) }]
      : []),
    ...(u.posts_published
      ? [{ key: 'perPublished', value: money(u.month_cost_usd / u.posts_published) }]
      : []),
  ]
})
const ratio = computed(() =>
  usage.value?.budget_usd ? usage.value.month_cost_usd / usage.value.budget_usd : 0,
)

const message = ref('')
const isError = ref(false)
const { mutate: save, isLoading } = useMutation({
  mutation: () => api.updateTopic(props.topicId, { monthly_budget_usd: budget.value ?? 0 }),
  async onSuccess() {
    isError.value = false
    message.value = t('settings.budgetSaved')
    await queryCache.invalidateQueries({ key: ['usage', props.topicId] })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <section class="section-card budget" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`" class="section-title">{{ t('settings.budget') }}</h2>
    <template v-if="usage">
      <p class="spent">
        {{
          t('settings.spent', {
            spent: money(usage.month_cost_usd),
            budget: money(usage.budget_usd),
          })
        }}
      </p>
      <!-- Native meter: exposed to assistive technologies with its value. -->
      <meter
        class="meter"
        min="0"
        :max="usage.budget_usd || 1"
        :low="usage.budget_usd * 0.7"
        :high="usage.budget_usd * 0.9"
        :optimum="0"
        :value="usage.month_cost_usd"
        :aria-label="
          t('settings.spent', {
            spent: money(usage.month_cost_usd),
            budget: money(usage.budget_usd),
          })
        "
      ></meter>
      <table v-if="usage.by_operation.length">
        <caption class="visually-hidden">
          {{
            t('settings.spentCaption')
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">{{ t('settings.operation') }}</th>
            <th scope="col" class="num">{{ t('settings.calls') }}</th>
            <th scope="col" class="num">{{ t('settings.cost') }}</th>
            <th scope="col" class="num">{{ t('settings.costPerCall') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in usage.by_operation" :key="row.operation">
            <th scope="row">{{ label(row.operation) }}</th>
            <td class="num">{{ row.calls }}</td>
            <td class="num">{{ money(row.cost_usd) }}</td>
            <td class="num">{{ money(row.calls ? row.cost_usd / row.calls : 0) }}</td>
          </tr>
        </tbody>
      </table>
      <!-- Averages: what the topic costs per day and per post, and the month's projection. -->
      <dl v-if="averages.length" class="averages">
        <div v-for="a in averages" :key="a.key">
          <dt>{{ t(`settings.averages.${a.key}`) }}</dt>
          <dd>{{ a.value }}</dd>
        </div>
      </dl>
      <p v-if="averages.length" class="hint">
        {{
          t('settings.averages.hint', {
            drafted: usage.posts_drafted,
            published: usage.posts_published,
          })
        }}
      </p>
      <p v-if="ratio >= 1" class="notice notice-inline" data-tone="danger">
        <Icon name="alert-circle" />
        <span>{{ t('errors.budget_exceeded') }}</span>
      </p>
    </template>

    <form class="form subsection" @submit.prevent="save()">
      <div class="form-row">
        <label :for="`${id}-budget`">{{
          inTokens ? t('settings.budgetLabelTokens') : t('settings.budgetLabel')
        }}</label>
        <input
          :id="`${id}-budget`"
          v-model.number="budgetField"
          class="field amount"
          type="number"
          min="0"
          :max="inTokens ? 5_000_000_000 : 10000"
          :step="inTokens ? 100000 : 0.5"
          required
          :aria-describedby="`${id}-budget-hint`"
        />
        <p :id="`${id}-budget-hint`" class="hint">{{ t('settings.budgetHint') }}</p>
      </div>
      <div class="section-actions">
        <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
          {{ t('common.save') }}
        </button>
        <p role="status" :class="{ error: isError }">{{ message }}</p>
      </div>
    </form>
  </section>
</template>

<style scoped>
.budget p {
  margin: 0;
}

.spent {
  font-weight: 600;
}

.meter {
  width: 100%;
  height: 1.25rem;
}

table {
  border-collapse: collapse;
}

th,
td {
  padding: var(--space-1) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: start;
}

.averages {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(8.5rem, 100%), 1fr));
  gap: var(--space-3);
  margin: 0;
}

.averages div {
  padding: var(--space-3);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
}

.averages dt {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.averages dd {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.num {
  text-align: end;
  font-variant-numeric: tabular-nums;
}

.amount {
  max-width: 10rem;
}
</style>
