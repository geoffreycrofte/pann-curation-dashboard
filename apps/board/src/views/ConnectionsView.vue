<script setup lang="ts">
import { isMultiAccount, PROVIDER_INFO, PROVIDERS, type Provider } from '@pann/shared'
import { useQuery } from '@pinia/colada'
import { useI18n } from 'vue-i18n'
import McpSection from '../components/McpSection.vue'
import ProviderCard from '../components/ProviderCard.vue'
import { api } from '../lib/api'
import { useWorkspace } from '../lib/workspace'

const { t } = useI18n()
const groups = [
  {
    key: 'collect',
    label: 'connections.groupCollect',
    providers: PROVIDERS.filter(
      (p) => !['diffusion', 'newsletter'].includes(PROVIDER_INFO[p].need),
    ),
  },
  {
    key: 'diffusion',
    label: 'connections.groupDiffusion',
    providers: PROVIDERS.filter((p) => PROVIDER_INFO[p].need === 'diffusion'),
  },
  {
    key: 'newsletter',
    label: 'connections.groupNewsletter',
    providers: PROVIDERS.filter((p) => PROVIDER_INFO[p].need === 'newsletter'),
  },
] as const
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

const accountsOf = (provider: Provider) =>
  (credentials.value ?? []).filter((c) => c.provider === provider)
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
  <template v-else>
    <section v-for="group in groups" :key="group.key" :aria-labelledby="`group-${group.key}`">
      <h2 :id="`group-${group.key}`" class="group-title">{{ t(group.label) }}</h2>
      <div class="providers">
        <template v-for="provider in group.providers" :key="provider">
          <!-- Networks with several accounts: one card per account, then one to add another. -->
          <template v-if="isMultiAccount(provider)">
            <ProviderCard
              v-for="credential in accountsOf(provider)"
              :key="`${provider}/${credential.account}`"
              :provider="provider"
              :workspace-id="workspaceId"
              :credential="credential"
              :can-edit="isOwner"
            />
            <ProviderCard
              v-if="isOwner || !accountsOf(provider).length"
              :key="`${provider}/new`"
              :provider="provider"
              :workspace-id="workspaceId"
              :can-edit="isOwner"
              :adding="accountsOf(provider).length > 0"
            />
          </template>
          <ProviderCard
            v-else
            :provider="provider"
            :workspace-id="workspaceId"
            :credential="credentials?.find((c) => c.provider === provider)"
            :can-edit="isOwner"
          />
        </template>
      </div>
    </section>
    <McpSection />
  </template>
</template>

<style scoped>
.group-title {
  margin: var(--space-8) 0 0;
}

.providers {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-4);
}
</style>
