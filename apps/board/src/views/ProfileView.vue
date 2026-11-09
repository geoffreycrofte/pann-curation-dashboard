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
import { useMutation, useQueryCache } from '@pinia/colada'
import { computed, reactive, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { setLang } from '../i18n'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { session } from '../lib/session'
import { supabase } from '../lib/supabase'
import { chosenTheme, setTheme, type Theme } from '../lib/theme'
import { useWorkspace } from '../lib/workspace'

/** The account of the signed-in person: identity, preferences, workspace, sessions. */
const { t, locale } = useI18n()
const id = useId()
const router = useRouter()
const queryCache = useQueryCache()
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
// Workspace: its owner renames it
// ---------------------------------------------------------------------------
const names = reactive<Record<string, string>>({})
const workspaceMessage = ref('')
const workspaceError = ref(false)
const { mutate: rename, isLoading: renaming } = useMutation({
  mutation: (workspaceId: string) => api.renameWorkspace(workspaceId, names[workspaceId] ?? ''),
  async onSuccess(workspace) {
    workspaceError.value = false
    workspaceMessage.value = t('profile.workspaceRenamed', { name: workspace.name })
    await queryCache.invalidateQueries({ key: ['me'] })
  },
  onError(err) {
    workspaceError.value = true
    workspaceMessage.value = describeError(err.message, t).text
  },
})
function nameOf(workspaceId: string, current: string) {
  names[workspaceId] ??= current
  return names[workspaceId]
}

// ---------------------------------------------------------------------------
// Account deletion: confirmed by typing the email address of the account
// ---------------------------------------------------------------------------
const confirmEmail = ref('')
const deleteMessage = ref('')
const confirmed = computed(
  () =>
    !!user.value?.email &&
    confirmEmail.value.trim().toLowerCase() === user.value.email.toLowerCase(),
)
const { mutate: deleteAccount, isLoading: deleting } = useMutation({
  mutation: () => api.deleteAccount(confirmEmail.value),
  async onSuccess() {
    // The job deletes the account: this device signs out right away.
    await supabase.auth.signOut({ scope: 'local' })
    await router.push({ name: 'login', query: { deleted: '1' } })
  },
  onError(err) {
    deleteMessage.value = describeError(err.message, t).text
  },
})

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
      <div v-for="membership in workspaces" :key="membership.workspace.id" class="workspace">
        <form
          v-if="membership.role === 'owner'"
          class="rename"
          @submit.prevent="rename(membership.workspace.id)"
        >
          <div class="form-row">
            <label :for="`${id}-ws-${membership.workspace.id}`">
              {{ t('profile.workspaceName') }}
            </label>
            <div class="inline">
              <input
                :id="`${id}-ws-${membership.workspace.id}`"
                :value="nameOf(membership.workspace.id, membership.workspace.name)"
                class="field"
                type="text"
                required
                maxlength="100"
                @input="names[membership.workspace.id] = ($event.target as HTMLInputElement).value"
              />
              <button type="submit" class="button" :disabled="renaming">
                {{ t('profile.rename') }}
              </button>
            </div>
          </div>
        </form>
        <p v-else class="workspace-name">{{ membership.workspace.name }}</p>
        <p>
          <span class="badge" :data-tone="membership.role === 'owner' ? 'accent' : undefined">
            {{ t(`profile.roles.${membership.role}`) }}
          </span>
        </p>
      </div>
      <p role="status" :class="{ error: workspaceError }">{{ workspaceMessage }}</p>
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

    <section class="card section danger" :aria-labelledby="`${id}-delete`">
      <h2 :id="`${id}-delete`">{{ t('profile.deleteTitle') }}</h2>
      <p>{{ t('profile.deleteIntro') }}</p>
      <ul class="consequences">
        <li>{{ t('profile.deleteWorkspaces') }}</li>
        <li>{{ t('profile.deleteShared') }}</li>
        <li>{{ t('profile.deleteSent') }}</li>
      </ul>
      <div>
        <AlertDialogRoot
          @update:open="(open) => open || ((confirmEmail = ''), (deleteMessage = ''))"
        >
          <AlertDialogTrigger as-child>
            <button type="button" class="button" data-variant="danger">
              {{ t('profile.deleteButton') }}
            </button>
          </AlertDialogTrigger>
          <AlertDialogPortal>
            <AlertDialogOverlay class="dialog-overlay" />
            <AlertDialogContent class="dialog">
              <AlertDialogTitle class="dialog-title">{{
                t('profile.deleteConfirmTitle')
              }}</AlertDialogTitle>
              <AlertDialogDescription>{{ t('profile.deleteConfirmText') }}</AlertDialogDescription>
              <form class="form confirm" @submit.prevent="confirmed && deleteAccount()">
                <div class="form-row">
                  <label :for="`${id}-confirm`">
                    {{ t('profile.deleteConfirmLabel', { email: user?.email }) }}
                  </label>
                  <input
                    :id="`${id}-confirm`"
                    v-model="confirmEmail"
                    class="field"
                    type="email"
                    autocomplete="off"
                    spellcheck="false"
                    required
                  />
                </div>
                <p v-if="deleteMessage" role="alert" class="error">{{ deleteMessage }}</p>
                <div class="dialog-actions">
                  <AlertDialogCancel class="button">{{ t('common.cancel') }}</AlertDialogCancel>
                  <button
                    type="submit"
                    class="button"
                    data-variant="danger"
                    :disabled="!confirmed || deleting"
                  >
                    {{ deleting ? t('profile.deleting') : t('profile.deleteButton') }}
                  </button>
                </div>
              </form>
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

.workspace {
  display: grid;
  gap: var(--space-2);
}

.workspace-name {
  font-weight: 650;
}

.inline {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.inline .field {
  flex: 1 1 14rem;
}

/* Account deletion: a danger edge, the text carries the warning. */
.danger {
  border-inline-start: 6px solid var(--color-danger);
}

.consequences {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding-inline-start: var(--space-6);
}

.confirm {
  margin-top: var(--space-4);
}

.confirm .error {
  margin: 0;
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
