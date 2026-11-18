<script setup lang="ts">
/**
 * Administration of Pann (platform admins only): the keys Pann pays for itself and the
 * cost centre of that spending. The API answers 404 to anyone else.
 */
import { PLATFORM_PROVIDERS, type PlatformProvider } from '@pann/shared'
import { useQuery, useQueryCache } from '@pinia/colada'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  api,
  type AccessRequest,
  type AccessRequestStatus,
  type FeatureRequest,
  type FeatureRequestStatus,
  type PlatformKey,
  type AdminWorkspace,
} from '../lib/api'
import { describeError } from '../lib/errors'
import { toast } from '../lib/toast'

const { t, n, d } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const {
  data: keys,
  error: keysError,
  isPending,
} = useQuery({
  key: ['admin', 'keys'],
  query: api.adminKeys,
})
const keyOf = (provider: PlatformProvider): PlatformKey | undefined =>
  keys.value?.find((k) => k.provider === provider)

// One form per provider: the typed key, its error, and whether it is being saved.
const secrets = ref<Record<string, string>>({})
const keyErrors = ref<Record<string, string>>({})
const busy = ref<string | null>(null)

async function saveKey(provider: PlatformProvider) {
  const secret = (secrets.value[provider] ?? '').trim()
  if (secret.length < 8) {
    keyErrors.value = { ...keyErrors.value, [provider]: t('admin.keyTooShort') }
    return
  }
  busy.value = provider
  keyErrors.value = { ...keyErrors.value, [provider]: '' }
  try {
    await api.setAdminKey(provider, secret)
    secrets.value = { ...secrets.value, [provider]: '' }
    toast(t('admin.keySaved'))
    await queryCache.invalidateQueries({ key: ['admin', 'keys'] })
  } catch (err) {
    keyErrors.value = {
      ...keyErrors.value,
      [provider]: describeError((err as Error).message, t).text,
    }
  } finally {
    busy.value = null
  }
}

async function removeKey(provider: PlatformProvider) {
  busy.value = provider
  try {
    await api.deleteAdminKey(provider)
    toast(t('admin.keyRemoved'))
    await queryCache.invalidateQueries({ key: ['admin', 'keys'] })
  } catch (err) {
    keyErrors.value = {
      ...keyErrors.value,
      [provider]: describeError((err as Error).message, t).text,
    }
  } finally {
    busy.value = null
  }
}

// Cost centre: limits of what Pann pays, and what it paid in a month.
const { data: settings } = useQuery({ key: ['admin', 'settings'], query: api.adminSettings })
const credit = ref(0)
const cap = ref(0)
const emailFrom = ref('')
watch(
  settings,
  (value) => {
    if (!value) return
    credit.value = Number(value.onboarding_credit_usd)
    cap.value = Number(value.monthly_cap_usd)
    emailFrom.value = value.email_from
  },
  { immediate: true },
)
const settingsError = ref('')
const savingSettings = ref(false)
async function saveSettings() {
  savingSettings.value = true
  settingsError.value = ''
  try {
    await api.updateAdminSettings({
      onboarding_credit_usd: credit.value,
      monthly_cap_usd: cap.value,
      email_from: emailFrom.value.trim(),
    })
    toast(t('common.saved'))
    await queryCache.invalidateQueries({ key: ['admin', 'settings'] })
  } catch (err) {
    settingsError.value = describeError((err as Error).message, t).text
  } finally {
    savingSettings.value = false
  }
}

const currentMonth = new Date().toISOString().slice(0, 7)
const month = ref(currentMonth)
const { data: usage, isPending: usagePending } = useQuery({
  key: () => ['admin', 'usage', month.value],
  query: () => api.adminUsage(month.value),
  enabled: () => /^\d{4}-\d{2}$/.test(month.value),
})
const total = computed(() => (usage.value ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0))
// Access requests: sign-up stays on invitation.
const { data: requests, error: requestsError } = useQuery({
  key: ['admin', 'access-requests'],
  query: api.adminAccessRequests,
})
const openRequests = computed(() => (requests.value ?? []).filter((r) => r.status === 'new'))
const handling = ref<string | null>(null)
const requestErrors = ref<Record<string, string>>({})
async function handle(request: AccessRequest, status: AccessRequestStatus) {
  handling.value = request.id
  requestErrors.value = { ...requestErrors.value, [request.id]: '' }
  try {
    await api.handleAccessRequest(request.id, status)
    toast(t(`admin.requestMarked.${status}`, { name: request.name }))
    await queryCache.invalidateQueries({ key: ['admin', 'access-requests'] })
  } catch (err) {
    requestErrors.value = {
      ...requestErrors.value,
      [request.id]: describeError((err as Error).message, t).text,
    }
  } finally {
    handling.value = null
  }
}

// Requests from the product: networks Pann does not publish to yet, coming tools.
const { data: featureRequests } = useQuery({
  key: ['admin', 'feature-requests'],
  query: api.adminFeatureRequests,
})
const FEATURE_STATUSES: readonly FeatureRequestStatus[] = ['new', 'planned', 'answered', 'declined']
async function setFeatureStatus(request: FeatureRequest, status: FeatureRequestStatus) {
  try {
    await api.setFeatureRequestStatus(request.id, status)
    toast(t('admin.featureMarked', { subject: request.subject }))
    await queryCache.invalidateQueries({ key: ['admin', 'feature-requests'] })
  } catch (err) {
    toast(describeError((err as Error).message, t).text)
  }
}

// Workspaces whose LinkedIn and Facebook go through Pann's Zernio (platform mode).
const { data: workspaces } = useQuery({ key: ['admin', 'workspaces'], query: api.adminWorkspaces })
async function setPlatform(workspace: AdminWorkspace, enabled: boolean) {
  try {
    await api.setZernioPlatform(workspace.id, enabled)
    toast(
      enabled
        ? t('admin.platformOn', { name: workspace.name })
        : t('admin.platformOff', { name: workspace.name }),
    )
    await queryCache.invalidateQueries({ key: ['admin', 'workspaces'] })
  } catch (err) {
    toast(describeError((err as Error).message, t).text)
  }
}

const usd = (value: number) => n(value, { style: 'currency', currency: 'USD' })
</script>

<template>
  <h1 tabindex="-1">{{ t('admin.title') }}</h1>
  <p>{{ t('admin.intro') }}</p>

  <section class="block" :aria-labelledby="`${id}-keys`">
    <h2 :id="`${id}-keys`">{{ t('admin.keysTitle') }}</h2>
    <p class="hint">{{ t('admin.keysIntro') }}</p>
    <p v-if="keysError" role="alert">{{ t('board.loadError', { message: keysError.message }) }}</p>
    <p v-else-if="isPending" role="status">{{ t('common.loading') }}</p>
    <ul v-else class="keys">
      <li v-for="provider in PLATFORM_PROVIDERS" :key="provider">
        <form class="key" @submit.prevent="saveKey(provider)">
          <h3 :id="`${id}-${provider}`">{{ t(`admin.providers.${provider}.name`) }}</h3>
          <p class="hint">{{ t(`admin.providers.${provider}.purpose`) }}</p>
          <p v-if="keyOf(provider)" class="status">
            {{ t(`connections.status.${keyOf(provider)!.status}`) }}.
            {{ t('connections.hint', { hint: keyOf(provider)!.hint }) }}.
            <span v-if="keyOf(provider)!.checked_at">
              {{
                t('admin.checkedOn', {
                  date: d(new Date(keyOf(provider)!.checked_at!), { dateStyle: 'medium' }),
                })
              }}
            </span>
          </p>
          <p v-else class="status">{{ t('connections.status.none') }}</p>
          <div class="form-row">
            <label :for="`${id}-${provider}-secret`">
              {{ keyOf(provider) ? t('admin.replaceKey') : t('admin.newKey') }}
            </label>
            <input
              :id="`${id}-${provider}-secret`"
              v-model="secrets[provider]"
              class="field"
              type="password"
              autocomplete="off"
              spellcheck="false"
              :aria-invalid="keyErrors[provider] ? true : undefined"
              :aria-describedby="keyErrors[provider] ? `${id}-${provider}-error` : undefined"
            />
          </div>
          <p v-if="keyErrors[provider]" :id="`${id}-${provider}-error`" class="error" role="alert">
            {{ keyErrors[provider] }}
          </p>
          <div class="actions">
            <button
              type="submit"
              class="button"
              data-variant="primary"
              :disabled="busy === provider"
            >
              {{ t('admin.saveKey') }}
            </button>
            <button
              v-if="keyOf(provider)"
              type="button"
              class="button"
              :disabled="busy === provider"
              :aria-describedby="`${id}-${provider}`"
              @click="removeKey(provider)"
            >
              {{ t('admin.removeKey') }}
            </button>
          </div>
        </form>
      </li>
    </ul>
  </section>

  <section class="block" :aria-labelledby="`${id}-requests`">
    <h2 :id="`${id}-requests`">{{ t('admin.requestsTitle') }}</h2>
    <p class="hint">{{ t('admin.requestsIntro') }}</p>
    <p v-if="requestsError" role="alert">
      {{ t('board.loadError', { message: requestsError.message }) }}
    </p>
    <p v-else-if="!requests?.length">{{ t('admin.noRequests') }}</p>
    <template v-else>
      <p>{{ t('admin.openRequests', { count: openRequests.length }) }}</p>
      <ul class="requests">
        <li v-for="request in requests" :key="request.id" class="request">
          <h3>
            {{ request.name }}
            <span class="badge" :data-tone="request.status === 'new' ? 'accent' : undefined">
              {{ t(`admin.requestStatus.${request.status}`) }}
            </span>
          </h3>
          <p>
            <a :href="`mailto:${request.email}`">{{ request.email }}</a
            >,
            {{ d(new Date(request.created_at), { dateStyle: 'medium', timeStyle: 'short' }) }}
          </p>
          <p class="motivation" :lang="request.lang">{{ request.motivation }}</p>
          <p v-if="request.notify_error" class="error">
            {{ t('admin.notifyFailed', { reason: describeError(request.notify_error, t).text }) }}
          </p>
          <div class="actions">
            <button
              v-if="request.status !== 'accepted'"
              type="button"
              class="button"
              :disabled="handling === request.id"
              @click="handle(request, 'accepted')"
            >
              {{ t('admin.accept') }}<span class="visually-hidden"> {{ request.name }}</span>
            </button>
            <button
              v-if="request.status !== 'declined'"
              type="button"
              class="button"
              :disabled="handling === request.id"
              @click="handle(request, 'declined')"
            >
              {{ t('admin.decline') }}<span class="visually-hidden"> {{ request.name }}</span>
            </button>
            <button
              v-if="request.status !== 'new'"
              type="button"
              class="button"
              :disabled="handling === request.id"
              @click="handle(request, 'new')"
            >
              {{ t('admin.reopen') }}<span class="visually-hidden"> {{ request.name }}</span>
            </button>
          </div>
          <p v-if="requestErrors[request.id]" class="error" role="alert">
            {{ requestErrors[request.id] }}
          </p>
        </li>
      </ul>
    </template>
  </section>

  <section class="block" :aria-labelledby="`${id}-features`">
    <h2 :id="`${id}-features`">{{ t('admin.featuresTitle') }}</h2>
    <p class="hint">{{ t('admin.featuresIntro') }}</p>
    <p v-if="!featureRequests?.length">{{ t('admin.noFeatures') }}</p>
    <div v-else class="table-wrap">
      <table>
        <caption class="visually-hidden">
          {{
            t('admin.featuresTitle')
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">{{ t('admin.colRequest') }}</th>
            <th scope="col">{{ t('admin.colWorkspace') }}</th>
            <th scope="col">{{ t('admin.colDate') }}</th>
            <th scope="col">{{ t('admin.colStatus') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="request in featureRequests" :key="request.id">
            <th scope="row">
              {{
                request.kind === 'feature'
                  ? t(`admin.features.${request.subject}`, request.subject)
                  : t('admin.network', { name: request.subject })
              }}
            </th>
            <td>{{ request.workspace?.name ?? '-' }}</td>
            <td>{{ d(new Date(request.created_at), { dateStyle: 'medium' }) }}</td>
            <td>
              <label class="visually-hidden" :for="`${id}-feature-${request.id}`">
                {{ t('admin.colStatus') }}
              </label>
              <select
                :id="`${id}-feature-${request.id}`"
                class="field"
                :value="request.status"
                @change="
                  setFeatureStatus(
                    request,
                    ($event.target as HTMLSelectElement).value as FeatureRequestStatus,
                  )
                "
              >
                <option v-for="status in FEATURE_STATUSES" :key="status" :value="status">
                  {{ t(`admin.featureStatus.${status}`) }}
                </option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="block" :aria-labelledby="`${id}-workspaces`">
    <h2 :id="`${id}-workspaces`">{{ t('admin.workspacesTitle') }}</h2>
    <p class="hint">{{ t('admin.workspacesIntro') }}</p>
    <div v-if="workspaces?.length" class="table-wrap">
      <table>
        <caption class="visually-hidden">
          {{
            t('admin.workspacesTitle')
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">{{ t('admin.colWorkspace') }}</th>
            <th scope="col">{{ t('admin.colDate') }}</th>
            <th scope="col">{{ t('admin.colPlatform') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="workspace in workspaces" :key="workspace.id">
            <th scope="row">{{ workspace.name }}</th>
            <td>{{ d(new Date(workspace.created_at), { dateStyle: 'medium' }) }}</td>
            <td>
              <div class="form-check">
                <input
                  :id="`${id}-platform-${workspace.id}`"
                  type="checkbox"
                  :checked="workspace.zernio_platform"
                  @change="setPlatform(workspace, ($event.target as HTMLInputElement).checked)"
                />
                <label :for="`${id}-platform-${workspace.id}`">
                  {{ t('admin.platformLabel', { n: workspace.accounts }) }}
                </label>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="block" :aria-labelledby="`${id}-costs`">
    <h2 :id="`${id}-costs`">{{ t('admin.costsTitle') }}</h2>
    <p class="hint">{{ t('admin.costsIntro') }}</p>

    <form class="limits" @submit.prevent="saveSettings">
      <div class="form-row">
        <label :for="`${id}-credit`">{{ t('admin.credit') }}</label>
        <input
          :id="`${id}-credit`"
          v-model.number="credit"
          class="field small"
          type="number"
          min="0"
          max="100"
          step="0.01"
          required
          :aria-describedby="`${id}-credit-hint`"
        />
        <p :id="`${id}-credit-hint`" class="hint">{{ t('admin.creditHint') }}</p>
      </div>
      <div class="form-row">
        <label :for="`${id}-cap`">{{ t('admin.cap') }}</label>
        <input
          :id="`${id}-cap`"
          v-model.number="cap"
          class="field small"
          type="number"
          min="0"
          max="100000"
          step="1"
          required
          :aria-describedby="`${id}-cap-hint`"
        />
        <p :id="`${id}-cap-hint`" class="hint">{{ t('admin.capHint') }}</p>
      </div>
      <div class="form-row wide">
        <label :for="`${id}-from`">{{ t('admin.emailFrom') }}</label>
        <input
          :id="`${id}-from`"
          v-model="emailFrom"
          class="field"
          type="text"
          autocomplete="off"
          spellcheck="false"
          maxlength="200"
          placeholder="Pann <noreply@example.org>"
          :aria-describedby="`${id}-from-hint`"
        />
        <p :id="`${id}-from-hint`" class="hint">{{ t('admin.emailFromHint') }}</p>
      </div>
      <div>
        <button type="submit" class="button" data-variant="primary" :disabled="savingSettings">
          {{ savingSettings ? t('common.saving') : t('common.save') }}
        </button>
      </div>
      <p v-if="settingsError" class="error" role="alert">{{ settingsError }}</p>
    </form>

    <div class="form-row month">
      <label :for="`${id}-month`">{{ t('admin.month') }}</label>
      <input
        :id="`${id}-month`"
        v-model="month"
        class="field small"
        type="month"
        :max="currentMonth"
      />
    </div>
    <p v-if="usagePending" role="status">{{ t('common.loading') }}</p>
    <template v-else>
      <p>
        {{ t('admin.total', { total: usd(total), cap: usd(cap) }) }}
      </p>
      <p v-if="!usage?.length">{{ t('admin.noUsage') }}</p>
      <div v-else class="table-wrap">
        <table>
          <caption class="visually-hidden">
            {{
              t('admin.usageCaption', { month })
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ t('admin.colWorkspace') }}</th>
              <th scope="col">{{ t('admin.colService') }}</th>
              <th scope="col">{{ t('admin.colOperation') }}</th>
              <th scope="col" class="num">{{ t('admin.colCalls') }}</th>
              <th scope="col" class="num">{{ t('admin.colCost') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in usage" :key="`${row.workspace_id}/${row.provider}/${row.operation}`">
              <th scope="row">{{ row.workspace_name }}</th>
              <td>{{ row.provider }}</td>
              <td>{{ row.operation || '-' }}</td>
              <td class="num">{{ n(Number(row.calls)) }}</td>
              <td class="num">{{ usd(Number(row.cost_usd)) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.block {
  display: grid;
  gap: var(--space-3);
  max-width: 48rem;
  margin-top: var(--space-8);
}

.block h2,
.block p {
  margin: 0;
}

.keys {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.key {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.key h3,
.key p {
  margin: 0;
}

.key .field {
  width: 100%;
  max-width: 28rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.limits {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
  align-items: start;
  gap: var(--space-4);
}

.limits > .wide,
.limits > div:last-of-type,
.limits > .error {
  grid-column: 1 / -1;
}

.small {
  max-width: 10rem;
}

.requests {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.request {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.request h3,
.request p {
  margin: 0;
}

.request h3 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.motivation {
  white-space: pre-line;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
  text-align: start;
}

.num {
  text-align: end;
  font-variant-numeric: tabular-nums;
}
</style>
