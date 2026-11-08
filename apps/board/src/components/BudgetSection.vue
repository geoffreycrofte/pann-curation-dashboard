<script setup lang="ts">
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'

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

const usd = (value: number) =>
  n(value, { style: 'currency', currency: 'USD', maximumFractionDigits: value < 1 ? 4 : 2 })
const operations = ['triage', 'draft', 'search', 'other', 'rewrite']
const label = (operation: string) =>
  t(`settings.operations.${operations.includes(operation) ? operation : 'other'}`)
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
  <section class="budget" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`">{{ t('settings.budget') }}</h2>
    <template v-if="usage">
      <p class="spent">
        {{
          t('settings.spent', { spent: usd(usage.month_cost_usd), budget: usd(usage.budget_usd) })
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
          t('settings.spent', { spent: usd(usage.month_cost_usd), budget: usd(usage.budget_usd) })
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
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in usage.by_operation" :key="row.operation">
            <th scope="row">{{ label(row.operation) }}</th>
            <td class="num">{{ row.calls }}</td>
            <td class="num">{{ usd(row.cost_usd) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="ratio >= 1" class="error">{{ t('errors.budget_exceeded') }}</p>
    </template>

    <form class="form" @submit.prevent="save()">
      <div class="form-row">
        <label :for="`${id}-budget`">{{ t('settings.budgetLabel') }}</label>
        <input
          :id="`${id}-budget`"
          v-model.number="budget"
          class="field amount"
          type="number"
          min="0"
          max="10000"
          step="0.5"
          required
          :aria-describedby="`${id}-budget-hint`"
        />
        <p :id="`${id}-budget-hint`" class="hint">{{ t('settings.budgetHint') }}</p>
      </div>
      <div>
        <button type="submit" class="button" :disabled="isLoading">{{ t('common.save') }}</button>
      </div>
    </form>
    <p role="status" :class="{ error: isError }">{{ message }}</p>
  </section>
</template>

<style scoped>
.budget {
  display: grid;
  gap: var(--space-3);
  max-width: 40rem;
  margin-top: var(--space-6);
}

.budget h2,
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

.num {
  text-align: end;
  font-variant-numeric: tabular-nums;
}

.amount {
  max-width: 10rem;
}
</style>
