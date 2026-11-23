<script setup lang="ts">
import AdminAffiliates from '../components/admin/AdminAffiliates.vue'
import AdminPlans from '../components/admin/AdminPlans.vue'
import AdminWorkspacePlan from '../components/admin/AdminWorkspacePlan.vue'
import Icon from '../components/Icon.vue'
/**
 * Administration of Glimr (platform admins only): the keys Glimr pays for itself and the
 * cost centre of that spending. The API answers 404 to anyone else.
 */
import { PLATFORM_PROVIDERS, type PlatformProvider } from '@glimr/shared'
import { useQuery, useQueryCache } from '@pinia/colada'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
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
const route = useRoute()
const router = useRouter()

// One subject per tab, kept in the address (?tab=…), as in the topic settings.
const TABS = ['workspaces', 'requests', 'offers', 'costs', 'keys'] as const
type Tab = (typeof TABS)[number]
const tab = computed<Tab>({
  get() {
    const value = route.query.tab
    return (TABS as readonly unknown[]).includes(value) ? (value as Tab) : 'workspaces'
  },
  set(value) {
    void router.replace({
      query: { ...route.query, tab: value === 'workspaces' ? undefined : value },
    })
  },
})

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

// Cost centre: limits of what Glimr pays, and what it paid in a month.
const { data: settings } = useQuery({ key: ['admin', 'settings'], query: api.adminSettings })
const credit = ref(0)
const cap = ref(0)
const emailFrom = ref('')
const siteUrl = ref('')
watch(
  settings,
  (value) => {
    if (!value) return
    credit.value = Number(value.onboarding_credit_usd)
    cap.value = Number(value.monthly_cap_usd)
    emailFrom.value = value.email_from
    siteUrl.value = value.site_url
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
      site_url: siteUrl.value.trim().replace(/\/+$/, ''),
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
// Per workspace: everything it spent (its keys or Glimr's) and what it produced, to price
// the offers from real figures.
const { data: stats } = useQuery({
  key: () => ['admin', 'workspace-stats', month.value],
  query: () => api.adminWorkspaceStats(month.value),
  enabled: () => /^\d{4}-\d{2}$/.test(month.value),
})
/** Days counted for the month: so far for the current one, all of them otherwise. */
const monthDays = computed(() => {
  const [year, m] = month.value.split('-').map(Number) as [number, number]
  if (month.value === currentMonth) return new Date().getUTCDate()
  return new Date(Date.UTC(year, m, 0)).getUTCDate()
})
const usedStats = computed(() => stats.value ?? [])
// Requests from the product: networks Glimr does not publish to yet, coming tools.
const { data: featureRequests } = useQuery({
  key: ['admin', 'feature-requests'],
  query: api.adminFeatureRequests,
})
// Access requests: sign-up stays on invitation.
const { data: requests, error: requestsError } = useQuery({
  key: ['admin', 'access-requests'],
  query: api.adminAccessRequests,
})
const openRequests = computed(() => (requests.value ?? []).filter((r) => r.status === 'new'))
/** Waiting on an answer: access requests and requests from the product. */
const openCount = computed(
  () =>
    openRequests.value.length +
    (featureRequests.value ?? []).filter((r) => r.status === 'new').length,
)
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

// Workspaces whose LinkedIn and Facebook go through Glimr's Zernio (platform mode).
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

const DAY = 86_400_000
/** Where a workspace's billing stands, in a few words and a tone. */
function billingOf(w: AdminWorkspace): { label: string; tone?: string } {
  const date = (iso: string | null) => (iso ? d(new Date(iso), { dateStyle: 'medium' }) : '-')
  switch (w.billing_status) {
    case 'trialing': {
      const left = w.trial_ends_at ? Math.ceil((Date.parse(w.trial_ends_at) - Date.now()) / DAY) : 0
      return left > 0
        ? {
            label: t('admin.billing.trialing', { n: left, date: date(w.trial_ends_at) }, left),
            tone: 'accent',
          }
        : { label: t('admin.billing.trialEnded'), tone: 'danger' }
    }
    case 'active':
      if (w.trial_ends_at && Date.parse(w.trial_ends_at) > Date.now())
        return {
          label: t(`admin.billing.activeTrial.${w.billing_interval ?? 'month'}`, {
            date: date(w.trial_ends_at),
          }),
          tone: 'success',
        }
      return {
        label: t(`admin.billing.active.${w.billing_interval ?? 'month'}`, {
          date: date(w.current_period_end),
        }),
        tone: 'success',
      }
    case 'past_due':
      return { label: t('admin.billing.pastDue'), tone: 'danger' }
    case 'canceled':
      return { label: t('admin.billing.canceled', { date: date(w.current_period_end) }) }
    case 'expired':
      return { label: t('admin.billing.expired'), tone: 'danger' }
    default:
      return { label: t('admin.billing.legacy') }
  }
}

const usd = (value: number) => n(value, { style: 'currency', currency: 'USD' })
</script>

<template>
  <h1 tabindex="-1">{{ t('admin.title') }}</h1>
  <p class="intro">{{ t('admin.intro') }}</p>

  <TabsRoot v-model="tab" activation-mode="manual" class="sections">
    <TabsList :aria-label="t('admin.tabsLabel')" v-scroll-active class="subtabs tab-row">
      <TabsTrigger v-for="name in TABS" :key="name" :value="name" class="subtab">
        {{ t(`admin.tabs.${name}`) }}
        <span v-if="name === 'requests' && openCount" class="badge" data-tone="accent">
          {{ openCount }}<span class="visually-hidden"> {{ t('admin.tabs.open') }}</span>
        </span>
      </TabsTrigger>
    </TabsList>
    <TabsContent value="workspaces" class="tab-panel">
      <section class="section-card block" :aria-labelledby="`${id}-workspaces`">
        <h2 :id="`${id}-workspaces`" class="section-title">{{ t('admin.workspacesTitle') }}</h2>
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
                <th scope="col">{{ t('admin.colPlan') }}</th>
                <th scope="col">{{ t('admin.colBilling') }}</th>
                <th scope="col">{{ t('admin.colPlatform') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="workspace in workspaces" :key="workspace.id">
                <th scope="row">
                  <span class="ws-name">{{ workspace.name }}</span>
                  <span class="ws-meta">
                    {{ workspace.owner_email ?? t('admin.noOwner') }},
                    {{ d(new Date(workspace.created_at), { dateStyle: 'medium' }) }}
                  </span>
                </th>
                <td>
                  <AdminWorkspacePlan
                    :key="`${workspace.id}-${workspace.plan}`"
                    :workspace-id="workspace.id"
                    :workspace-name="workspace.name"
                    :plan="workspace.plan"
                    :limits="workspace.plan_limits"
                  />
                </td>
                <td>
                  <span class="badge" data-dot :data-tone="billingOf(workspace).tone">
                    {{ billingOf(workspace).label }}
                  </span>
                </td>
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
    </TabsContent>
    <TabsContent value="requests" class="tab-panel">
      <section class="section-card block" :aria-labelledby="`${id}-requests`">
        <h2 :id="`${id}-requests`" class="section-title">{{ t('admin.requestsTitle') }}</h2>
        <p class="hint">{{ t('admin.requestsIntro') }}</p>
        <p v-if="requestsError" role="alert">
          {{ t('board.loadError', { message: requestsError.message }) }}
        </p>
        <p v-else-if="!requests?.length">{{ t('admin.noRequests') }}</p>
        <template v-else>
          <p>{{ t('admin.openRequests', { count: openRequests.length }) }}</p>
          <ul class="requests">
            <li
              v-for="request in requests"
              :key="request.id"
              class="request"
              :data-status="request.status"
            >
              <div class="request-head">
                <span class="request-avatar" aria-hidden="true">{{
                  request.name.trim().charAt(0).toUpperCase()
                }}</span>
                <div class="request-who">
                  <h3>
                    {{ request.name }}
                    <span
                      class="badge"
                      data-dot
                      :data-tone="
                        request.status === 'new'
                          ? 'accent'
                          : request.status === 'accepted'
                            ? 'success'
                            : undefined
                      "
                    >
                      {{ t(`admin.requestStatus.${request.status}`) }}
                    </span>
                  </h3>
                  <p class="request-meta">
                    <a :href="`mailto:${request.email}`">{{ request.email }}</a
                    >,
                    {{
                      d(new Date(request.created_at), { dateStyle: 'medium', timeStyle: 'short' })
                    }}
                  </p>
                </div>
              </div>
              <blockquote class="motivation" :lang="request.lang">
                {{ request.motivation }}
              </blockquote>
              <p v-if="request.notify_error" class="notice notice-inline" data-tone="danger">
                <Icon name="alert-circle" />
                <span>{{
                  t('admin.notifyFailed', { reason: describeError(request.notify_error, t).text })
                }}</span>
              </p>
              <div class="actions">
                <button
                  v-if="request.status !== 'accepted'"
                  type="button"
                  class="button"
                  data-variant="primary"
                  data-size="small"
                  :disabled="handling === request.id"
                  @click="handle(request, 'accepted')"
                >
                  {{ t('admin.accept') }}<span class="visually-hidden"> {{ request.name }}</span>
                </button>
                <button
                  v-if="request.status !== 'declined'"
                  type="button"
                  class="button"
                  data-size="small"
                  :disabled="handling === request.id"
                  @click="handle(request, 'declined')"
                >
                  {{ t('admin.decline') }}<span class="visually-hidden"> {{ request.name }}</span>
                </button>
                <button
                  v-if="request.status !== 'new'"
                  type="button"
                  class="button"
                  data-size="small"
                  :disabled="handling === request.id"
                  @click="handle(request, 'new')"
                >
                  {{ t('admin.reopen') }}<span class="visually-hidden"> {{ request.name }}</span>
                </button>
              </div>
              <p
                v-if="requestErrors[request.id]"
                class="notice notice-inline"
                data-tone="danger"
                role="alert"
              >
                <Icon name="alert-circle" />
                <span>{{ requestErrors[request.id] }}</span>
              </p>
            </li>
          </ul>
        </template>
      </section>
      <section class="section-card block" :aria-labelledby="`${id}-features`">
        <h2 :id="`${id}-features`" class="section-title">{{ t('admin.featuresTitle') }}</h2>
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
    </TabsContent>
    <TabsContent value="offers" class="tab-panel">
      <AdminPlans />
    </TabsContent>
    <TabsContent value="costs" class="tab-panel">
      <section class="section-card block" :aria-labelledby="`${id}-costs`">
        <h2 :id="`${id}-costs`" class="section-title">{{ t('admin.costsTitle') }}</h2>
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
              placeholder="Glimr <noreply@example.org>"
              :aria-describedby="`${id}-from-hint`"
            />
            <p :id="`${id}-from-hint`" class="hint">{{ t('admin.emailFromHint') }}</p>
          </div>
          <div class="form-row wide">
            <label :for="`${id}-site`">{{ t('admin.siteUrl') }}</label>
            <input
              :id="`${id}-site`"
              v-model="siteUrl"
              class="field"
              type="url"
              autocomplete="off"
              spellcheck="false"
              maxlength="200"
              placeholder="https://glimr.cc"
              required
              :aria-describedby="`${id}-site-hint`"
            />
            <p :id="`${id}-site-hint`" class="hint">{{ t('admin.siteUrlHint') }}</p>
          </div>
          <div class="section-actions">
            <button type="submit" class="button" data-variant="primary" :disabled="savingSettings">
              {{ savingSettings ? t('common.saving') : t('common.save') }}
            </button>
          </div>
          <p v-if="settingsError" class="notice notice-inline" data-tone="danger" role="alert">
            <Icon name="alert-circle" />
            <span>{{ settingsError }}</span>
          </p>
        </form>

        <!-- The month's spending: apart from the limits form, under a rule. -->
        <div class="subsection spending">
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
                  <tr
                    v-for="row in usage"
                    :key="`${row.workspace_id}/${row.provider}/${row.operation}`"
                  >
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
        </div>

        <!-- Every workspace, whoever pays: cost per day and per post, to set the offers. -->
        <div class="subsection">
          <h3 class="subsection-title">{{ t('admin.statsTitle') }}</h3>
          <p class="hint">{{ t('admin.statsHint') }}</p>
          <p v-if="!usedStats.length">{{ t('admin.noStats') }}</p>
          <div v-else class="table-wrap">
            <table>
              <caption class="visually-hidden">
                {{
                  t('admin.statsCaption', { month })
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{{ t('admin.colWorkspace') }}</th>
                  <th scope="col">{{ t('admin.colPlan') }}</th>
                  <th scope="col" class="num">{{ t('admin.colTopics') }}</th>
                  <th scope="col" class="num">{{ t('admin.colCost') }}</th>
                  <th scope="col" class="num">{{ t('admin.colPaidByGlimr') }}</th>
                  <th scope="col" class="num">{{ t('admin.colPerDay') }}</th>
                  <th scope="col" class="num">{{ t('admin.colPublished') }}</th>
                  <th scope="col" class="num">{{ t('admin.colPerPost') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in usedStats" :key="row.workspace_id">
                  <th scope="row">{{ row.workspace_name }}</th>
                  <td>{{ t(`plans.names.${row.plan}`) }}</td>
                  <td class="num">{{ n(Number(row.topics)) }}</td>
                  <td class="num">{{ usd(Number(row.cost_usd)) }}</td>
                  <td class="num">{{ usd(Number(row.platform_cost_usd)) }}</td>
                  <td class="num">{{ usd(Number(row.cost_usd) / monthDays) }}</td>
                  <td class="num">{{ n(Number(row.posts_published)) }}</td>
                  <td class="num">
                    {{
                      Number(row.posts_published)
                        ? usd(Number(row.cost_usd) / Number(row.posts_published))
                        : '-'
                    }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </TabsContent>
    <TabsContent value="keys" class="tab-panel">
      <section class="section-card block" :aria-labelledby="`${id}-keys`">
        <h2 :id="`${id}-keys`" class="section-title">{{ t('admin.keysTitle') }}</h2>
        <p class="hint">{{ t('admin.keysIntro') }}</p>
        <p v-if="keysError" role="alert">
          {{ t('board.loadError', { message: keysError.message }) }}
        </p>
        <p v-else-if="isPending" role="status">{{ t('common.loading') }}</p>
        <ul v-else class="keys">
          <li v-for="provider in PLATFORM_PROVIDERS" :key="provider">
            <form class="key" @submit.prevent="saveKey(provider)">
              <h3 :id="`${id}-${provider}`">{{ t(`admin.providers.${provider}.name`) }}</h3>
              <p class="hint">{{ t(`admin.providers.${provider}.purpose`) }}</p>
              <!-- Same status pattern as Connexions: a badge, then the key's details. -->
              <p v-if="keyOf(provider)" class="status">
                <span
                  class="badge"
                  data-dot
                  :data-tone="
                    keyOf(provider)!.status === 'ok'
                      ? 'success'
                      : keyOf(provider)!.status === 'invalid'
                        ? 'danger'
                        : 'accent'
                  "
                  >{{ t(`connections.status.${keyOf(provider)!.status}`) }}</span
                >
                <span class="hint">{{
                  t('connections.hint', { hint: keyOf(provider)!.hint })
                }}</span>
                <span v-if="keyOf(provider)!.checked_at" class="hint">
                  {{
                    t('admin.checkedOn', {
                      date: d(new Date(keyOf(provider)!.checked_at!), { dateStyle: 'medium' }),
                    })
                  }}
                </span>
              </p>
              <p v-else class="status">
                <span class="badge" data-dot>{{ t('connections.status.none') }}</span>
              </p>
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
              <p
                v-if="keyErrors[provider]"
                :id="`${id}-${provider}-error`"
                class="error"
                role="alert"
              >
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
                  class="button remove"
                  data-size="small"
                  data-variant="danger"
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
      <AdminAffiliates />
    </TabsContent>
  </TabsRoot>
</template>

<style scoped>
/* One card per section, the title inside. */
.intro {
  max-width: var(--width-content);
}

/* Tables of workspaces and costs: the admin takes the width it needs. */
.sections {
  max-width: 72rem;
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

.subtab .badge {
  margin-inline-start: var(--space-1);
}

.ws-name {
  display: block;
}

.ws-meta {
  display: block;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  font-weight: 400;
}

.block p {
  margin: 0;
}

/* Keys and requests: rows of their card, split by a rule (no card inside a card). */
.keys,
.requests {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* The first key sits apart from the section's intro. */
.keys {
  margin-top: var(--space-2);
}

.keys > li + li {
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
}

.key {
  display: grid;
  gap: var(--space-2);
}

.status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-3);
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
  align-items: center;
  gap: var(--space-2);
}

.actions .remove {
  margin-inline-start: auto;
}

.spending {
  gap: var(--space-3);
}

.limits {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
  align-items: start;
  gap: var(--space-4);
}

.limits > .wide,
.limits > div:last-of-type,
.limits > .notice {
  grid-column: 1 / -1;
}

.small {
  max-width: 10rem;
}

/* One tile per request, on the page's background; a gold edge while it waits. */
.request {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-bg);
}

.request[data-status='new'] {
  border-inline-start: 4px solid var(--color-accent-fill);
}

.request-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.request-avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: var(--color-neutral-soft);
  font-family: var(--font-display);
  font-weight: 800;
}

.request[data-status='new'] .request-avatar {
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
}

.request-who {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
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
  font-size: 1.0625rem;
}

.request-meta {
  color: var(--color-text-muted);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

/* The person's own words: a quote, apart from Glimr's text. */
.motivation {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-inline-start: 3px solid var(--color-border);
  border-radius: 0 var(--radius) var(--radius) 0;
  background: var(--color-surface);
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
