<script setup lang="ts">
/**
 * Access request (sign-up stays on invitation): a person without an account says who
 * they are and why they want Pann; the admins receive it by email.
 */
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import LangSwitcher from '../components/LangSwitcher.vue'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'

const { t, locale } = useI18n()
const id = useId()

const name = ref('')
const email = ref('')
const motivation = ref('')
/** Honeypot: hidden from people and from screen readers; bots fill it in. */
const website = ref('')
const state = ref<'idle' | 'sending' | 'sent' | 'error'>('idle')
const errorMessage = ref('')

async function submit() {
  state.value = 'sending'
  try {
    await api.requestAccess({
      name: name.value,
      email: email.value,
      motivation: motivation.value,
      lang: locale.value === 'en' ? 'en' : 'fr',
      website: website.value,
    })
    state.value = 'sent'
  } catch (err) {
    errorMessage.value = describeError((err as Error).message, t).text
    state.value = 'error'
  }
}
</script>

<template>
  <div class="request">
    <LangSwitcher class="lang" />
    <h1 tabindex="-1">{{ t('access.title') }}</h1>
    <p>{{ t('access.intro') }}</p>

    <p v-if="state === 'sent'" class="notice" role="status">{{ t('access.sent') }}</p>
    <form v-else class="form" @submit.prevent="submit">
      <div class="form-row">
        <label :for="`${id}-name`">{{ t('access.name') }}</label>
        <input
          :id="`${id}-name`"
          v-model="name"
          class="field"
          type="text"
          autocomplete="name"
          required
          maxlength="120"
        />
      </div>
      <div class="form-row">
        <label :for="`${id}-email`">{{ t('auth.email') }}</label>
        <input
          :id="`${id}-email`"
          v-model="email"
          class="field"
          type="email"
          autocomplete="email"
          required
          maxlength="254"
        />
      </div>
      <div class="form-row">
        <label :for="`${id}-motivation`">{{ t('access.motivation') }}</label>
        <textarea
          :id="`${id}-motivation`"
          v-model="motivation"
          class="field"
          rows="6"
          required
          minlength="20"
          maxlength="2000"
          :aria-describedby="`${id}-motivation-hint`"
        ></textarea>
        <p :id="`${id}-motivation-hint`" class="hint">{{ t('access.motivationHint') }}</p>
      </div>
      <div class="trap" aria-hidden="true">
        <label :for="`${id}-website`">Website</label>
        <input
          :id="`${id}-website`"
          v-model="website"
          type="text"
          tabindex="-1"
          autocomplete="off"
        />
      </div>
      <div>
        <button type="submit" class="button" data-variant="primary" :disabled="state === 'sending'">
          {{ state === 'sending' ? t('access.sending') : t('access.submit') }}
        </button>
      </div>
      <p v-if="state === 'error'" role="alert" class="error">
        {{ t('access.error', { message: errorMessage }) }}
      </p>
    </form>

    <p>
      <RouterLink :to="{ name: 'login' }">{{ t('access.backToLogin') }}</RouterLink>
    </p>
  </div>
</template>

<style scoped>
.request {
  display: grid;
  gap: var(--space-4);
  max-width: 36rem;
  margin: 0 auto;
  padding: clamp(var(--space-6), 6vw, 6rem) var(--gutter);
}

.request h1,
.request p {
  margin: 0;
}

.lang {
  justify-self: end;
}

.form {
  display: grid;
  gap: var(--space-4);
}

.form textarea {
  width: 100%;
  resize: vertical;
}

/* Off screen for people, still in the form for bots. */
.trap {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
</style>
