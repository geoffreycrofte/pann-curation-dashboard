<script setup lang="ts">
/**
 * Admin space: the offer of one workspace, in its row of the costs table. The custom offer
 * takes its own limits (empty: no limit; no tokens: the workspace brings its own keys).
 */
import { PLANS, type Plan, type PlanLimits } from '@glimr/shared'
import { useQueryCache } from '@pinia/colada'
import { reactive, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../lib/api'
import { describeError } from '../../lib/errors'
import { toast } from '../../lib/toast'

const props = defineProps<{
  workspaceId: string
  workspaceName: string
  plan: Plan
  limits: Partial<PlanLimits>
}>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const selected = ref<Plan>(props.plan)
const custom = reactive({
  max_topics: props.limits.max_topics ?? ('' as number | ''),
  max_social_accounts: props.limits.max_social_accounts ?? ('' as number | ''),
  monthly_tokens: props.limits.monthly_tokens ?? ('' as number | ''),
})
const saving = ref(false)

async function save() {
  const value = (v: number | '') => (v === '' ? null : Number(v))
  saving.value = true
  try {
    await api.adminSetWorkspacePlan(
      props.workspaceId,
      selected.value,
      selected.value === 'custom'
        ? {
            max_topics: value(custom.max_topics),
            max_social_accounts: value(custom.max_social_accounts),
            monthly_tokens: value(custom.monthly_tokens),
          }
        : {},
    )
    toast(
      t('admin.plans.workspaceSaved', {
        name: props.workspaceName,
        plan: t(`plans.names.${selected.value}`),
      }),
    )
    await queryCache.invalidateQueries({ key: ['admin', 'workspace-stats'] })
  } catch (err) {
    toast(describeError((err as Error).message, t).text)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="workspace-plan" @submit.prevent="save">
    <select
      v-model="selected"
      class="field"
      :aria-label="t('admin.plans.planOf', { name: workspaceName })"
    >
      <option v-for="p in PLANS" :key="p" :value="p">{{ t(`plans.names.${p}`) }}</option>
    </select>
    <fieldset v-if="selected === 'custom'" class="custom">
      <legend class="visually-hidden">
        {{ t('admin.plans.customOf', { name: workspaceName }) }}
      </legend>
      <label :for="`${id}-topics`">{{ t('admin.plans.maxTopics') }}</label>
      <input
        :id="`${id}-topics`"
        v-model.number="custom.max_topics"
        class="field"
        type="number"
        min="1"
      />
      <label :for="`${id}-accounts`">{{ t('admin.plans.maxAccounts') }}</label>
      <input
        :id="`${id}-accounts`"
        v-model.number="custom.max_social_accounts"
        class="field"
        type="number"
        min="1"
      />
      <label :for="`${id}-tokens`">{{ t('admin.plans.monthlyTokens') }}</label>
      <input
        :id="`${id}-tokens`"
        v-model.number="custom.monthly_tokens"
        class="field"
        type="number"
        min="1"
        step="100000"
      />
    </fieldset>
    <button
      v-if="selected !== plan || selected === 'custom'"
      type="submit"
      class="button"
      data-variant="primary"
      data-size="small"
      :disabled="saving"
    >
      {{ t('common.save') }}
    </button>
  </form>
</template>

<style scoped>
.workspace-plan {
  display: grid;
  gap: var(--space-2);
  justify-items: start;
  min-width: 10rem;
}

.custom {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
}

.custom label {
  font-size: 0.8125rem;
  font-weight: 650;
}

.custom .field {
  max-width: 9rem;
}
</style>
