<script setup lang="ts">
import { isMultiAccount, PROVIDER_INFO, PROVIDERS, type Provider } from '@pann/shared'
import { useQuery } from '@pinia/colada'
import { useI18n } from 'vue-i18n'
import McpSection from '../components/McpSection.vue'
import ProviderCard from '../components/ProviderCard.vue'
import ZernioPlatformCard from '../components/ZernioPlatformCard.vue'
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

// LinkedIn and Facebook through Pann's Zernio, for the workspaces a platform admin chose.
const { data: platform } = useQuery({
  key: () => ['zernio-platform', workspaceId.value ?? ''],
  query: () => api.zernioPlatform(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})
const viaPann = (provider: Provider) =>
  provider === 'zernio' &&
  !!platform.value?.enabled &&
  !credentials.value?.some((c) => c.provider === 'zernio')

const accountsOf = (provider: Provider) =>
  (credentials.value ?? []).filter((c) => c.provider === provider)
</script>

<template>
  <div class="connections">
    <h1 tabindex="-1">{{ t('connections.title') }}</h1>
    <p class="intro">{{ t('connections.intro') }}</p>
    <p class="hint">{{ t('connections.security') }}</p>
    <p v-if="workspaceId && !isOwner" class="hint">{{ t('connections.ownerOnly') }}</p>

    <p v-if="workspaceError || error" role="alert">
      {{ t('board.loadError', { message: (workspaceError ?? error)?.message }) }}
    </p>
    <p v-else-if="!workspaceId || isPending" role="status">{{ t('common.loading') }}</p>
    <div v-else class="section-stack groups">
      <!-- One card per group, its title inside; the services are rows split by a rule. -->
      <section
        v-for="group in groups"
        :key="group.key"
        class="section-card"
        :aria-labelledby="`group-${group.key}`"
      >
        <h2 :id="`group-${group.key}`" class="section-title">{{ t(group.label) }}</h2>
        <div class="providers">
          <template v-for="provider in group.providers" :key="provider">
            <!-- Networks with several accounts: one row per account, then one to add another. -->
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
            <ZernioPlatformCard
              v-else-if="viaPann(provider) && platform"
              :workspace-id="workspaceId"
              :link="platform"
            />
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
    </div>
  </div>
</template>

<style scoped>
/* The same width as the settings panels. */
.connections {
  max-width: var(--width-content);
}

.intro {
  margin-bottom: var(--space-2);
}

.groups {
  margin-top: var(--space-6);
}

/* Services of a group: rows split by a rule, more space around the rule than inside a row. */
.providers {
  display: grid;
  gap: var(--space-4);
}

.providers > * + * {
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
}
</style>
