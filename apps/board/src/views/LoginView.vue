<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '../lib/supabase'

const { t } = useI18n()
const email = ref('')
const state = ref<'idle' | 'sending' | 'sent' | 'error'>('idle')
const errorMessage = ref('')

async function submit() {
  state.value = 'sending'
  const { error } = await supabase.auth.signInWithOtp({
    email: email.value,
    // Personal use: accounts are invited, no public signup.
    options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
  })
  if (error) {
    errorMessage.value = error.message
    state.value = 'error'
  } else {
    state.value = 'sent'
  }
}
</script>

<template>
  <h1 tabindex="-1">{{ t('auth.title') }}</h1>
  <form class="login" @submit.prevent="submit">
    <label for="email">{{ t('auth.email') }}</label>
    <input
      id="email"
      v-model="email"
      type="email"
      name="email"
      autocomplete="email"
      required
      :aria-describedby="state === 'error' ? 'login-status' : undefined"
    />
    <button type="submit" class="button" data-variant="primary" :disabled="state === 'sending'">
      {{ state === 'sending' ? t('auth.sending') : t('auth.submit') }}
    </button>
  </form>
  <p id="login-status" role="status" :class="{ error: state === 'error' }">
    <template v-if="state === 'sent'">{{ t('auth.sent', { email }) }}</template>
    <template v-else-if="state === 'error'">{{
      t('auth.error', { message: errorMessage })
    }}</template>
  </p>
</template>

<style scoped>
.login {
  display: grid;
  gap: var(--space-2);
  max-width: 24rem;
}

input {
  min-height: 2.75rem;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
}

.error {
  color: var(--color-danger);
}
</style>
