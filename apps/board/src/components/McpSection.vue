<script setup lang="ts">
import type { OAuthGrant } from '@supabase/supabase-js'
import { computed, onMounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '../lib/supabase'

const { t, tm, rt, d } = useI18n()
const id = useId()
const url = `${window.location.origin}/mcp`
const local = /^(localhost|127\.|\[::1\])/.test(window.location.hostname)
const steps = computed(() => (tm('connections.mcpSteps') as unknown[]).map((s) => rt(s as string)))

const grants = ref<OAuthGrant[]>()
const unavailable = ref(false)
const message = ref('')
const isError = ref(false)

async function load() {
  const { data, error } = await supabase.auth.oauth.listGrants()
  unavailable.value = !!error
  grants.value = error ? [] : data
}
onMounted(load)

async function copy() {
  try {
    await navigator.clipboard.writeText(url)
    isError.value = false
    message.value = t('connections.mcpCopied')
  } catch (err) {
    isError.value = true
    message.value = t('common.error', { message: (err as Error).message })
  }
}

async function revoke(grant: OAuthGrant) {
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId: grant.client.id })
  if (error) {
    isError.value = true
    message.value = t('common.error', { message: error.message })
    return
  }
  isError.value = false
  message.value = t('connections.revoked', { client: grant.client.name })
  await load()
}
</script>

<template>
  <section class="mcp" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`" class="group-title">{{ t('connections.mcpTitle') }}</h2>
    <div class="card body">
      <p>{{ t('connections.mcpIntro') }}</p>
      <div class="url-row">
        <span class="label">{{ t('connections.mcpUrl') }}</span>
        <code>{{ url }}</code>
        <button type="button" class="button" @click="copy">{{ t('connections.mcpCopy') }}</button>
      </div>
      <p v-if="local" class="hint">{{ t('connections.mcpPublic') }}</p>
      <ol>
        <li v-for="(step, index) in steps" :key="index">{{ step }}</li>
      </ol>

      <h3 :id="`${id}-grants`">{{ t('connections.grants') }}</h3>
      <p v-if="!grants" role="status">{{ t('common.loading') }}</p>
      <p v-else-if="unavailable" class="hint">{{ t('connections.grantsUnavailable') }}</p>
      <p v-else-if="!grants.length">{{ t('connections.grantsEmpty') }}</p>
      <ul v-else class="grants" :aria-labelledby="`${id}-grants`">
        <li v-for="grant in grants" :key="grant.client.id">
          <span class="client">{{ grant.client.name }}</span>
          <span class="hint">{{
            t('connections.grantedOn', {
              date: d(new Date(grant.granted_at), { dateStyle: 'long' }),
            })
          }}</span>
          <button
            type="button"
            class="button"
            :aria-label="t('connections.revokeLabel', { client: grant.client.name })"
            @click="revoke(grant)"
          >
            {{ t('connections.revoke') }}
          </button>
        </li>
      </ul>
      <p role="status" :class="{ error: isError }">{{ message }}</p>
    </div>
  </section>
</template>

<style scoped>
.group-title {
  margin: var(--space-8) 0 var(--space-4);
}

.body {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-6);
}

.body p,
.body h3,
.body ol,
.body ul {
  margin: 0;
}

.body h3 {
  margin-top: var(--space-3);
  font-size: 1.125rem;
}

.url-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}

.label {
  font-weight: 650;
}

code {
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius);
  background: var(--color-surface-2);
  overflow-wrap: anywhere;
}

ol {
  padding-inline-start: var(--space-6);
}

.grants {
  display: grid;
  gap: var(--space-2);
  padding: 0;
  list-style: none;
}

.grants li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4);
}

.client {
  font-weight: 650;
}
</style>
