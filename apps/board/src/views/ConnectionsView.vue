<script setup lang="ts">
import { PROVIDERS } from '@pann/shared'
import { useQuery } from '@pinia/colada'
import { useI18n } from 'vue-i18n'
import ProviderCard from '../components/ProviderCard.vue'
import { api } from '../lib/api'
import { useWorkspace } from '../lib/workspace'

const { t } = useI18n()
const { workspaceId, isOwner, error: workspaceError } = useWorkspace()

const {
  data: credentials,
  isPending,
  error,
} = useQuery({
  key: () => ['credentials', workspaceId.value ?? ''],
  query: () => api.credentials(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})
</script>

<template>
  <h1 tabindex="-1">{{ t('connections.title') }}</h1>
  <p>{{ t('connections.intro') }}</p>
  <p class="hint">{{ t('connections.security') }}</p>
  <p v-if="workspaceId && !isOwner" class="hint">{{ t('connections.ownerOnly') }}</p>

  <p v-if="workspaceError || error" role="alert">
    {{ t('board.loadError', { message: (workspaceError ?? error)?.message }) }}
  </p>
  <p v-else-if="!workspaceId || isPending" role="status">{{ t('common.loading') }}</p>
  <div v-else class="providers">
    <ProviderCard
      v-for="provider in PROVIDERS"
      :key="provider"
      :provider="provider"
      :workspace-id="workspaceId"
      :credential="credentials?.find((c) => c.provider === provider)"
      :can-edit="isOwner"
    />
  </div>
</template>

<style scoped>
.providers {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-4);
}
</style>
