<script setup lang="ts">
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { supabase } from '../lib/supabase'

/**
 * OAuth consent page of the Supabase Auth OAuth 2.1 server (Authorization Path
 * /oauth/consent): an MCP client such as Claude asks to act with the user's account.
 */
const { t, tm, rt } = useI18n()
const route = useRoute()
const authorizationId = computed(() =>
  typeof route.query.authorization_id === 'string' ? route.query.authorization_id : '',
)

const details = ref<OAuthAuthorizationDetails>()
const state = ref<'loading' | 'ready' | 'working' | 'error'>('loading')
const errorMessage = ref('')
const can = computed(() => (tm('consent.can') as unknown[]).map((s) => rt(s as string)))
const client = computed(() => details.value?.client.name || '')
const host = computed(() => {
  try {
    return new URL(details.value?.redirect_uri ?? '').host
  } catch {
    return details.value?.redirect_uri ?? ''
  }
})

function fail(message: string) {
  errorMessage.value = message
  state.value = 'error'
}

onMounted(async () => {
  if (!authorizationId.value) return fail(t('consent.missing'))
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId.value)
  if (error) return fail(t('consent.error', { message: error.message }))
  // Already authorized for these scopes: straight back to the client.
  if ('redirect_url' in data) return window.location.assign(data.redirect_url)
  details.value = data
  state.value = 'ready'
})

async function decide(approve: boolean) {
  state.value = 'working'
  const options = { skipBrowserRedirect: true }
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId.value, options)
    : await supabase.auth.oauth.denyAuthorization(authorizationId.value, options)
  if (error) return fail(t('consent.error', { message: error.message }))
  window.location.assign(data.redirect_url)
}
</script>

<template>
  <section class="consent card" aria-labelledby="consent-title">
    <h1 id="consent-title" tabindex="-1">
      {{ client ? t('consent.title', { client }) : t('consent.titleUnknown') }}
    </h1>

    <p v-if="state === 'loading'" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="state === 'error'" role="alert" class="error">{{ errorMessage }}</p>

    <template v-if="details && state !== 'error'">
      <p>
        {{ t('consent.intro', { client, email: details.user.email }) }}
      </p>
      <ul>
        <li v-for="(line, index) in can" :key="index">{{ line }}</li>
      </ul>
      <p>{{ t('consent.cannot') }}</p>
      <p class="hint">{{ t('consent.revoke') }}</p>
      <p class="hint">{{ t('consent.redirect', { host }) }}</p>
      <div class="actions">
        <button
          type="button"
          class="button"
          data-variant="primary"
          :disabled="state === 'working'"
          @click="decide(true)"
        >
          {{ t('consent.approve') }}
        </button>
        <button type="button" class="button" :disabled="state === 'working'" @click="decide(false)">
          {{ t('consent.deny') }}
        </button>
      </div>
      <p role="status">{{ state === 'working' ? t('consent.working') : '' }}</p>
    </template>
  </section>
</template>

<style scoped>
.consent {
  display: grid;
  gap: var(--space-4);
  max-width: 40rem;
  padding: var(--space-6);
}

.consent h1,
.consent p,
.consent ul {
  margin: 0;
}

.consent h1 {
  font-size: 1.75rem;
}

.consent ul {
  display: grid;
  gap: var(--space-1);
  padding-inline-start: var(--space-6);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
