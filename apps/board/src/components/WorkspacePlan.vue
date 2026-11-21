<script setup lang="ts">
/**
 * The offer of a workspace: its limits and, when Pann provides the AI, the tokens used this
 * month. Tokens only, never dollars, on those offers.
 */
import { useQuery } from '@pinia/colada'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'

const props = defineProps<{ workspaceId: string }>()
const { t, n } = useI18n()

const { data: plan } = useQuery({
  key: () => ['workspace-plan', props.workspaceId],
  query: () => api.workspacePlan(props.workspaceId),
})

const tokens = (value: number) => n(value, { notation: 'compact', maximumFractionDigits: 1 })
const provided = computed(() => plan.value?.monthly_tokens != null)
</script>

<template>
  <div v-if="plan" class="plan">
    <p class="label-row">
      <span class="plan-label">{{ t('plans.label') }}</span>
      <span class="badge" data-tone="accent">{{ t(`plans.names.${plan.plan}`) }}</span>
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
      <p class="hint">{{ t('plans.tokensHint') }}</p>
    </template>
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
</style>
