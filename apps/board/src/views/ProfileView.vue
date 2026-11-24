<script setup lang="ts">
import Icon from '../components/Icon.vue'
import { UI_LANGS, type UiLang } from '@glimr/shared'
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
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed, reactive, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { setLang } from '../i18n'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { session } from '../lib/session'
import { supabase } from '../lib/supabase'
import { chosenTheme, setTheme, type Theme } from '../lib/theme'
import { useWorkspace } from '../lib/workspace'
import WorkspaceTeam from '../components/WorkspaceTeam.vue'
import WorkspacePlan from '../components/WorkspacePlan.vue'
import { toast } from '../lib/toast'

/** The account of the signed-in person: identity, preferences, workspace, sessions. */
const { t, locale } = useI18n()
const id = useId()
const router = useRouter()
const queryCache = useQueryCache()
const { data: me, workspaceId, membership } = useWorkspace()

const user = computed(() => session.value?.user)

// Five sections, one tab each, kept in the address (?tab=…): the trial banner links to the
// workspace and its offer.
const TABS = ['profile', 'preferences', 'workspace', 'team', 'account'] as const
type Tab = (typeof TABS)[number]
const route = useRoute()
const tab = computed<Tab>({
  get: () => {
    const value = route.query.tab
    return (TABS as readonly unknown[]).includes(value) ? (value as Tab) : 'profile'
  },
  set: (value) =>
    void router.replace({
      query: { ...route.query, tab: value === 'profile' ? undefined : value },
    }),
})
const workspaces = computed(() => me.value?.workspaces ?? [])

// The team of the current workspace. Below the top offer (a single seat), the tab is
// greyed with a crown and invites to that offer; a workspace that already has other
// members keeps its team whatever its offer.
const { data: plan } = useQuery({
  key: () => ['workspace-plan', workspaceId.value ?? ''],
  query: () => api.workspacePlan(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})
const teamLocked = computed(
  () =>
    !!plan.value &&
    plan.value.max_members !== null &&
    plan.value.max_members <= 1 &&
    plan.value.members <= 1,
)

// ---------------------------------------------------------------------------
// Identity: display name (user metadata) and email (Supabase confirms the change)
// ---------------------------------------------------------------------------
const fullName = ref<string>((user.value?.user_metadata?.full_name as string | undefined) ?? '')
const email = ref(user.value?.email ?? '')
const initial = computed(
  () => (fullName.value.trim() || email.value).charAt(0).toUpperCase() || '?',
)
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
  // A pending email change needs reading (a link to follow): it stays next to the form.
  identityMessage.value = emailChanged ? t('profile.emailPending', { email: newEmail }) : ''
  if (!emailChanged) toast(t('common.saved'))
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

  <TabsRoot v-model="tab" activation-mode="manual" class="sections">
    <TabsList :aria-label="t('profile.tabsLabel')" v-scroll-active class="subtabs tab-row">
      <TabsTrigger
        v-for="name in TABS"
        :key="name"
        :value="name"
        class="subtab"
        :data-locked="(name === 'team' && teamLocked) || undefined"
      >
        {{ t(`profile.tabs.${name}`) }}
        <template v-if="name === 'team' && teamLocked">
          <Icon name="crown" :size="18" class="crown" />
          <span class="visually-hidden">{{ t('team.lockedHint') }}</span>
        </template>
      </TabsTrigger>
    </TabsList>
    <TabsContent value="profile" class="tab-panel">
      <form
        class="section-card section"
        :aria-labelledby="`${id}-identity`"
        @submit.prevent="saveIdentity"
      >
        <h2 :id="`${id}-identity`" class="section-title">{{ t('profile.identity') }}</h2>
        <!-- The same avatar as the account menu: the initial of the name, decorative. -->
        <div class="who">
          <span class="avatar" aria-hidden="true">{{ initial }}</span>
          <p class="who-text">
            <span class="who-name">{{ fullName || email }}</span>
            <span v-if="fullName" class="who-email">{{ email }}</span>
          </p>
        </div>
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
        <div class="section-actions">
          <button type="submit" class="button" data-variant="primary" :disabled="savingIdentity">
            {{ savingIdentity ? t('common.saving') : t('common.save') }}
          </button>
          <p role="status" :class="{ error: identityError }">{{ identityMessage }}</p>
        </div>
      </form>
    </TabsContent>
    <TabsContent value="preferences" class="tab-panel">
      <section class="section-card section" :aria-labelledby="`${id}-prefs`">
        <h2 :id="`${id}-prefs`" class="section-title">{{ t('profile.preferences') }}</h2>
        <p class="hint">{{ t('profile.preferencesHint') }}</p>
        <fieldset class="choices">
          <legend class="form-label">{{ t('lang.label') }}</legend>
          <div v-for="lang in UI_LANGS" :key="lang" class="form-check">
            <input
              :id="`${id}-lang-${lang}`"
              type="radio"
              :name="`${id}-lang`"
              :value="lang"
              :checked="locale === lang"
              @change="setLang(lang as UiLang)"
            />
            <label :for="`${id}-lang-${lang}`" :lang="lang">{{ t(`lang.${lang}`) }}</label>
          </div>
        </fieldset>
        <fieldset class="choices">
          <legend class="form-label">{{ t('profile.theme') }}</legend>
          <div
            v-for="value in ['system', 'light', 'dark'] as const"
            :key="value"
            class="form-check"
          >
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
    </TabsContent>
    <TabsContent value="workspace" class="tab-panel">
      <section class="section-card section" :aria-labelledby="`${id}-workspace`">
        <h2 :id="`${id}-workspace`" class="section-title">{{ t('profile.workspace') }}</h2>
        <p class="hint">{{ t('profile.workspaceHint') }}</p>
        <div v-for="membership in workspaces" :key="membership.workspace.id" class="workspace">
          <form
            v-if="membership.role === 'owner'"
            class="rename"
            @submit.prevent="rename(membership.workspace.id)"
          >
            <div class="form-row">
              <!-- The role sits on the label's line: it qualifies this workspace. -->
              <div class="label-row">
                <label :for="`${id}-ws-${membership.workspace.id}`">
                  {{ t('profile.workspaceName') }}
                </label>
                <span class="badge" data-tone="accent">{{ t('profile.roles.owner') }}</span>
              </div>
              <div class="inline">
                <input
                  :id="`${id}-ws-${membership.workspace.id}`"
                  :value="nameOf(membership.workspace.id, membership.workspace.name)"
                  class="field"
                  type="text"
                  required
                  maxlength="100"
                  @input="
                    names[membership.workspace.id] = ($event.target as HTMLInputElement).value
                  "
                />
                <button
                  type="submit"
                  class="button"
                  data-variant="primary"
                  data-size="small"
                  :disabled="renaming"
                >
                  {{ t('profile.rename') }}
                </button>
              </div>
            </div>
          </form>
          <p v-else class="label-row">
            <span class="workspace-name">{{ membership.workspace.name }}</span>
            <span class="badge">{{ t(`profile.roles.${membership.role}`) }}</span>
          </p>
          <WorkspacePlan
            :workspace-id="membership.workspace.id"
            :is-owner="membership.role === 'owner'"
          />
        </div>
        <p role="status" class="message" :class="{ error: workspaceError }">
          {{ workspaceMessage }}
        </p>
      </section>
    </TabsContent>
    <TabsContent value="team" class="tab-panel">
      <section class="section-card section" :aria-labelledby="`${id}-team`">
        <h2 :id="`${id}-team`" class="section-title">
          {{ t('team.title', { name: membership?.workspace.name ?? '' }) }}
        </h2>
        <div v-if="teamLocked" class="upgrade">
          <Icon name="crown" :size="32" class="crown" />
          <p>{{ t('team.lockedText', { plan: t('plans.names.pro') }) }}</p>
          <RouterLink
            v-if="membership?.role === 'owner'"
            :to="{ name: 'profile', query: { tab: 'workspace', offer: 'open' } }"
            class="button"
            data-variant="primary"
          >
            {{ t('team.upgrade', { plan: t('plans.names.pro') }) }}
          </RouterLink>
          <p v-else class="hint">{{ t('team.askOwner') }}</p>
        </div>
        <template v-else-if="membership && plan">
          <p class="hint">{{ t('team.hint') }}</p>
          <WorkspaceTeam
            :workspace-id="membership.workspace.id"
            :is-owner="membership.role === 'owner'"
            :max-members="plan.max_members"
          />
        </template>
      </section>
    </TabsContent>
    <TabsContent value="account" class="tab-panel">
      <section class="section-card section" :aria-labelledby="`${id}-security`">
        <h2 :id="`${id}-security`" class="section-title">{{ t('profile.security') }}</h2>
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
                  <AlertDialogAction
                    class="button"
                    data-variant="primary"
                    @click="signOutEverywhere"
                  >
                    {{ t('profile.signOutEverywhere') }}
                  </AlertDialogAction>
                </div>
              </AlertDialogContent>
            </AlertDialogPortal>
          </AlertDialogRoot>
        </div>
      </section>

      <section class="section-card section danger" :aria-labelledby="`${id}-delete`">
        <h2 :id="`${id}-delete`" class="section-title">{{ t('profile.deleteTitle') }}</h2>
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
                <AlertDialogDescription>{{
                  t('profile.deleteConfirmText')
                }}</AlertDialogDescription>
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
                  <p
                    v-if="deleteMessage"
                    role="alert"
                    class="notice notice-inline"
                    data-tone="danger"
                  >
                    <Icon name="alert-circle" />
                    <span>{{ deleteMessage }}</span>
                  </p>
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
    </TabsContent>
  </TabsRoot>
</template>

<style scoped>
/* Team tab below the top offer: greyed (muted, lighter, even on hover), with a gold crown
 * (the offer that opens it). Its text keeps the contrast of the other tabs. */
.subtab[data-locked] {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 450;
}

.subtab[data-locked]:hover {
  color: var(--color-text-muted);
}

.crown {
  color: var(--color-accent-text);
}

.upgrade {
  display: grid;
  justify-items: start;
  gap: var(--space-3);
  max-width: 36rem;
}

/* The same width as the settings panels and Connexions. */
.intro,
.sections {
  max-width: var(--width-content);
}

.sections {
  display: grid;
  gap: var(--space-2);
}

.tab-panel {
  display: grid;
  gap: var(--space-6);
}

/* Inactive panels stay in the page, empty and hidden: no room for them in the grid. */
.tab-panel[hidden] {
  display: none;
}

.who {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 800;
}

.who-text {
  display: grid;
  margin: 0;
  min-width: 0;
}

.who-name {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.who-email {
  color: var(--color-text-muted);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.section p {
  margin: 0;
}

/* Empty live regions: kept for announcements, out of the layout (no blank under a card). */
.section-actions p:empty,
.message:empty {
  position: absolute;
}

.label-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-3);
}

.label-row label {
  font-weight: 650;
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

.workspace + .workspace {
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
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
</style>
