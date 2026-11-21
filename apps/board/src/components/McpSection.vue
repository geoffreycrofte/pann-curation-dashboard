<script setup lang="ts">
import type { OAuthGrant } from '@supabase/supabase-js'
import { computed, onMounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '../lib/supabase'
import Icon from './Icon.vue'

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
  <section class="section-card mcp" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`" class="section-title">{{ t('connections.mcpTitle') }}</h2>
    <p>{{ t('connections.mcpIntro') }}</p>
    <div class="url-block">
      <div class="url-row">
        <span class="label">{{ t('connections.mcpUrl') }}</span>
        <code>{{ url }}</code>
        <button type="button" class="button" data-size="small" @click="copy">
          {{ t('connections.mcpCopy') }}
        </button>
      </div>
      <p v-if="local" class="hint">{{ t('connections.mcpPublic') }}</p>
    </div>
    <ol>
      <li v-for="(step, index) in steps" :key="index">{{ step }}</li>
    </ol>

    <section class="subsection" :aria-labelledby="`${id}-grants`">
      <h3 :id="`${id}-grants`" class="subsection-title">{{ t('connections.grants') }}</h3>
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
            class="button revoke"
            data-size="small"
            data-variant="danger"
            :aria-label="t('connections.revokeLabel', { client: grant.client.name })"
            @click="revoke(grant)"
          >
            {{ t('connections.revoke') }}
          </button>
        </li>
      </ul>
    </section>
    <p v-if="isError && message" class="notice notice-inline" data-tone="danger" role="alert">
      <Icon name="alert-circle" />
      <span>{{ message }}</span>
    </p>
    <p role="status" class="message">{{ isError ? '' : message }}</p>
  </section>
</template>

<style scoped>
.mcp ol,
.mcp ul,
.url-block p {
  margin: 0;
}

.url-block {
  display: grid;
  gap: var(--space-1);
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

/* Each authorised app on a row of a bordered list, "Revoke" at its end. */
.grants {
  display: grid;
  padding: 0;
  list-style: none;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
}

.grants li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-4);
  padding: var(--space-2) var(--space-4);
}

.grants li + li {
  border-top: 1px solid var(--color-border-subtle);
}

.revoke {
  margin-inline-start: auto;
}

.client {
  font-weight: 650;
}

.message:empty {
  position: absolute;
}
</style>
