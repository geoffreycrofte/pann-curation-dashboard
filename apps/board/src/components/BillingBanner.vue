<script setup lang="ts">
/**
 * On every page of the board: how many days of trial are left, or that the workspace no
 * longer runs (trial over, subscription stopped, payment failed). Leads to the Profile.
 */
import { trialDaysLeft } from '@glimr/shared'
import { useQuery } from '@pinia/colada'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { useWorkspace } from '../lib/workspace'
import Icon from './Icon.vue'

const { t } = useI18n()
const { workspaceId } = useWorkspace()
const { data: plan } = useQuery({
  key: () => ['workspace-plan', workspaceId.value ?? ''],
  query: () => api.workspacePlan(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})

const banner = computed(() => {
  const p = plan.value
  if (!p) return null
  if (!p.active) return { tone: 'danger', text: t('billing.banner.inactive') }
  if (p.billing_status === 'past_due') return { tone: 'danger', text: t('billing.pastDue') }
  if (p.billing_status === 'trialing')
    return { tone: 'accent', text: t('billing.banner.trial', trialDaysLeft(p.trial_ends_at)) }
  return null
})
</script>

<template>
  <p
    v-if="banner && workspaceId"
    class="notice notice-inline billing-banner"
    :data-tone="banner.tone === 'danger' ? 'danger' : undefined"
    role="note"
  >
    <Icon v-if="banner.tone === 'danger'" name="alert-circle" />
    <span>
      {{ banner.text }}
      <RouterLink :to="{ name: 'profile', hash: `#offer-${workspaceId}` }">
        {{ t('billing.banner.link') }}
      </RouterLink>
    </span>
  </p>
</template>

<style scoped>
.billing-banner {
  margin-bottom: var(--space-5);
}
</style>
