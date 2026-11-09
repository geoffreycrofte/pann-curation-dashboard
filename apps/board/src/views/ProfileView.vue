<script setup lang="ts">
import { LANGS, type Lang } from '@pann/shared'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger,
} from 'reka-ui'
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { setLang } from '../i18n'
import { session } from '../lib/session'
import { supabase } from '../lib/supabase'
import { chosenTheme, setTheme, type Theme } from '../lib/theme'
import { useWorkspace } from '../lib/workspace'

/** The account of the signed-in person: identity, preferences, workspace, sessions. */
const { t, locale } = useI18n()
const id = useId()
const router = useRouter()
const { data: me } = useWorkspace()

const user = computed(() => session.value?.user)
const workspaces = computed(() => me.value?.workspaces ?? [])

// ---------------------------------------------------------------------------
// Identity: display name (user metadata) and email (Supabase confirms the change)
// ---------------------------------------------------------------------------
const fullName = ref<string>((user.value?.user_metadata?.full_name as string | undefined) ?? '')
const email = ref(user.value?.email ?? '')
const identityMessage = ref('')
const identityError = ref(false)
const savingIdentity = ref(false)

async function saveIdentity() {
  savingIdentity.value = true
  identityError.value = false
  const newEmail = email.value.trim().toLowerCase()
  const emailChanged = !!newEmail && newEmail !== user.value?.email
  const { error } = await supabase.auth.updateUser(
    { data: { full_name: fullName.value.trim() }, ...(emailChanged ? { email: newEmail } : {}) },
    { emailRedirectTo: `${window.location.origin}/profile` },
  )
  savingIdentity.value = false
  if (error) {
    identityError.value = true
    identityMessage.value = t('profile.identityFailed', { message: error.message })
    return
  }
  identityMessage.value = emailChanged
    ? t('profile.emailPending', { email: newEmail })
    : t('common.saved')
}

// ---------------------------------------------------------------------------
// Preferences: kept on this device, like the controls of the menu
// ---------------------------------------------------------------------------
const theme = ref<Theme | 'system'>(chosenTheme() ?? 'system')
function pickTheme(value: Theme | 'system') {
  theme.value = value
  setTheme(value === 'system' ? null : value)
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
async function signOutEverywhere() {
  await supabase.auth.signOut({ scope: 'global' })
  await router.push({ name: 'login' })
}
</script>

<template>
  <h1 tabindex="-1">{{ t('profile.title') }}</h1>
  <p class="intro">{{ t('profile.intro') }}</p>

  <div class="sections">
    <form
      class="card section form"
      :aria-labelledby="`${id}-identity`"
      @submit.prevent="saveIdentity"
    >
      <h2 :id="`${id}-identity`">{{ t('profile.identity') }}</h2>
      <div class="form-row">
        <label :for="`${id}-name`">{{ t('profile.name') }}</label>
        <input
          :id="`${id}-name`"
          v-model="fullName"
          class="field"
          type="text"
          autocomplete="name"
          maxlength="100"
          :aria-describedby="`${id}-name-hint`"
        />
        <p :id="`${id}-name-hint`" class="hint">{{ t('profile.nameHint') }}</p>
      </div>
      <div class="form-row">
        <label :for="`${id}-email`">{{ t('profile.email') }}</label>
        <input
          :id="`${id}-email`"
          v-model="email"
          class="field"
          type="email"
          autocomplete="email"
          required
          spellcheck="false"
          :aria-describedby="`${id}-email-hint`"
        />
        <p :id="`${id}-email-hint`" class="hint">{{ t('profile.emailHint') }}</p>
      </div>
      <div>
        <button type="submit" class="button" data-variant="primary" :disabled="savingIdentity">
          {{ savingIdentity ? t('common.saving') : t('common.save') }}
        </button>
      </div>
      <p role="status" :class="{ error: identityError }">{{ identityMessage }}</p>
    </form>

    <section class="card section" :aria-labelledby="`${id}-prefs`">
      <h2 :id="`${id}-prefs`">{{ t('profile.preferences') }}</h2>
      <p class="hint">{{ t('profile.preferencesHint') }}</p>
      <fieldset class="choices">
        <legend class="form-label">{{ t('lang.label') }}</legend>
        <div v-for="lang in LANGS" :key="lang" class="form-check">
          <input
            :id="`${id}-lang-${lang}`"
            type="radio"
            :name="`${id}-lang`"
            :value="lang"
            :checked="locale === lang"
            @change="setLang(lang as Lang)"
          />
          <label :for="`${id}-lang-${lang}`" :lang="lang">{{ t(`lang.${lang}`) }}</label>
        </div>
      </fieldset>
      <fieldset class="choices">
        <legend class="form-label">{{ t('profile.theme') }}</legend>
        <div v-for="value in ['system', 'light', 'dark'] as const" :key="value" class="form-check">
          <input
            :id="`${id}-theme-${value}`"
            type="radio"
            :name="`${id}-theme`"
            :value="value"
            :checked="theme === value"
            @change="pickTheme(value)"
          />
          <label :for="`${id}-theme-${value}`">{{ t(`profile.themes.${value}`) }}</label>
        </div>
      </fieldset>
    </section>

    <section class="card section" :aria-labelledby="`${id}-workspace`">
      <h2 :id="`${id}-workspace`">{{ t('profile.workspace') }}</h2>
      <dl class="facts">
        <template v-for="membership in workspaces" :key="membership.workspace.id">
          <dt>{{ membership.workspace.name }}</dt>
          <dd>
            <span class="badge" :data-tone="membership.role === 'owner' ? 'accent' : undefined">
              {{ t(`profile.roles.${membership.role}`) }}
            </span>
          </dd>
        </template>
      </dl>
      <p class="hint">{{ t('profile.workspaceHint') }}</p>
    </section>

    <section class="card section" :aria-labelledby="`${id}-security`">
      <h2 :id="`${id}-security`">{{ t('profile.security') }}</h2>
      <p>{{ t('profile.magicLink') }}</p>
      <p v-if="user?.last_sign_in_at" class="hint">
        {{
          t('profile.lastSignIn', {
            date: new Date(user.last_sign_in_at).toLocaleString(locale, {
              dateStyle: 'long',
              timeStyle: 'short',
            }),
          })
        }}
      </p>
      <div>
        <AlertDialogRoot>
          <AlertDialogTrigger as-child>
            <button type="button" class="button">{{ t('profile.signOutEverywhere') }}</button>
          </AlertDialogTrigger>
          <AlertDialogPortal>
            <AlertDialogOverlay class="dialog-overlay" />
            <AlertDialogContent class="dialog">
              <AlertDialogTitle class="dialog-title">
                {{ t('profile.signOutEverywhereTitle') }}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {{ t('profile.signOutEverywhereText') }}
              </AlertDialogDescription>
              <div class="dialog-actions">
                <AlertDialogCancel class="button">{{ t('common.cancel') }}</AlertDialogCancel>
                <AlertDialogAction class="button" data-variant="primary" @click="signOutEverywhere">
                  {{ t('profile.signOutEverywhere') }}
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialogRoot>
      </div>
    </section>
  </div>
</template>

<style scoped>
.intro {
  max-width: 40rem;
}

.sections {
  display: grid;
  gap: var(--space-5);
  max-width: 40rem;
}

.section {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-6);
}

.section h2,
.section p {
  margin: 0;
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-5);
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
}

.choices legend {
  width: 100%;
  margin-bottom: var(--space-1);
  padding: 0;
  font-family: inherit;
  font-size: 1rem;
}

.facts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2) var(--space-4);
  margin: 0;
}

.facts dt {
  font-weight: 650;
  overflow-wrap: anywhere;
}

.facts dd {
  margin: 0;
}

@media (max-width: 40rem) {
  .section {
    padding: var(--space-4);
  }
}
</style>
