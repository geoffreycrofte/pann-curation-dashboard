<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import PannMark from '../components/PannMark.vue'
import LangSwitcher from '../components/LangSwitcher.vue'
import { supabase } from '../lib/supabase'

const { t } = useI18n()
const route = useRoute()
/** Arrived here after deleting the account (Profile page). */
const deleted = route.query.deleted === '1'
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
  <div class="login">
    <section class="intro" aria-labelledby="login-brand">
      <PannMark :size="88" />
      <p id="login-brand" class="brand">{{ t('app.name') }}</p>
      <p class="tagline">{{ t('auth.pitch') }}</p>
    </section>

    <section class="panel" aria-labelledby="login-title">
      <div class="panel-inner">
        <LangSwitcher class="lang" />
        <h1 id="login-title" tabindex="-1">{{ t('auth.title') }}</h1>
        <p v-if="deleted" class="notice" role="status">{{ t('auth.accountDeleted') }}</p>
        <p class="hint">{{ t('auth.intro') }}</p>
        <form class="form" @submit.prevent="submit">
          <div class="form-row">
            <label for="email">{{ t('auth.email') }}</label>
            <input
              id="email"
              v-model="email"
              class="field"
              type="email"
              name="email"
              autocomplete="email"
              required
              :aria-describedby="state === 'error' ? 'login-status' : undefined"
            />
          </div>
          <button
            type="submit"
            class="button"
            data-variant="primary"
            :disabled="state === 'sending'"
          >
            {{ state === 'sending' ? t('auth.sending') : t('auth.submit') }}
          </button>
        </form>
        <p id="login-status" role="status" :class="{ error: state === 'error' }">
          <template v-if="state === 'sent'">{{ t('auth.sent', { email }) }}</template>
          <template v-else-if="state === 'error'">{{
            t('auth.error', { message: errorMessage })
          }}</template>
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  min-height: 100vh;
}

.intro {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-4);
  padding: clamp(var(--space-6), 6vw, 6rem);
  background: var(--color-ink);
  color: var(--color-on-ink);
}

.brand {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(3rem, 2rem + 4vw, 5.5rem);
  font-weight: 800;
  line-height: 0.95;
  letter-spacing: -0.03em;
}

.tagline {
  max-width: 28rem;
  margin: 0;
  font-size: 1.25rem;
  color: var(--color-on-ink-muted);
}

.panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(var(--space-6), 6vw, 6rem) var(--space-6);
}

.panel-inner {
  display: grid;
  gap: var(--space-4);
  width: min(26rem, 100%);
}

.panel-inner h1 {
  margin: 0;
}

.lang {
  justify-self: end;
  width: 14rem;
}

.form .button {
  width: 100%;
}

@media (max-width: 48rem) {
  .login {
    grid-template-columns: 1fr;
  }

  .intro {
    gap: var(--space-2);
  }
}
</style>
