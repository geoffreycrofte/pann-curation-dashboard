<script setup lang="ts">
import { PROVIDER_INFO, type Provider, type WorkspaceCredential } from '@pann/shared'
import { useMutation, useQueryCache } from '@pinia/colada'
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
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'

const props = defineProps<{
  provider: Provider
  workspaceId: string
  credential?: WorkspaceCredential
  canEdit: boolean
}>()
const { t, tm, rt } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const info = computed(() => PROVIDER_INFO[props.provider])
const name = computed(() => t(`connections.providers.${props.provider}.name`))
const steps = computed(() =>
  (tm(`connections.providers.${props.provider}.steps`) as unknown[]).map((s) => rt(s as string)),
)
const status = computed(() => props.credential?.status ?? 'none')

// A checked key needs nothing more: the card shrinks to its name, status and purpose,
// and opens on demand (to replace the key, see the accounts…).
const expanded = ref(status.value !== 'ok')
const toggle = ref<HTMLButtonElement>()
watch(status, async (value, previous) => {
  if (value === 'ok' && previous !== 'ok') {
    const hadFocus = !!document.activeElement?.closest(`[data-card="${id}"]`)
    expanded.value = false
    // The focused control (the save button) disappears: keep focus in the card.
    if (hadFocus) {
      await nextTick()
      toggle.value?.focus()
    }
  } else if (value !== 'ok') expanded.value = true
})

const secret = ref('')
const instance = ref(props.credential?.meta.instance?.replace(/^https:\/\//, '') ?? '')
const message = ref('')
const isError = ref(false)

async function refresh() {
  await queryCache.invalidateQueries({ key: ['credentials', props.workspaceId] })
}

const { mutate: save, isLoading: saving } = useMutation({
  mutation: () =>
    api.setCredential(
      props.workspaceId,
      props.provider,
      secret.value,
      props.provider === 'mastodon' ? instance.value : undefined,
    ),
  async onSuccess(credential) {
    secret.value = ''
    isError.value = false
    const detail = credential.status_detail
      ? ` ${t(`connections.detail.${credential.status_detail}`)}`
      : ''
    message.value =
      t('connections.saved', {
        provider: name.value,
        status: t(`connections.status.${credential.status}`),
      }) + detail
    await refresh()
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})

// The accounts are listed by a job: read them again a few seconds later.
const { mutate: refreshAccounts, isLoading: refreshing } = useMutation({
  mutation: () => api.refreshCredential(props.workspaceId, props.provider as 'zernio' | 'brevo'),
  onSuccess() {
    isError.value = false
    message.value = t('connections.refreshRequested')
    setTimeout(refresh, 4000)
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})

const { mutate: remove } = useMutation({
  mutation: () => api.deleteCredential(props.workspaceId, props.provider),
  async onSuccess() {
    isError.value = false
    message.value = t('connections.removed', { provider: name.value })
    await refresh()
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <section class="card" :data-card="id" :data-collapsed="!expanded" :aria-labelledby="`${id}-name`">
    <header class="card-header">
      <h3 :id="`${id}-name`">{{ name }}</h3>
      <p v-if="expanded" class="need">{{ t(`connections.need.${info.need}`) }}</p>
      <p v-else class="status" :data-status="status">
        <span class="status-label">{{ t(`connections.status.${status}`) }}</span>
      </p>
    </header>

    <p class="purpose">{{ t(`connections.providers.${provider}.purpose`) }}</p>

    <button
      v-if="status === 'ok'"
      ref="toggle"
      type="button"
      class="button toggle"
      :aria-expanded="expanded"
      :aria-controls="`${id}-details`"
      @click="expanded = !expanded"
    >
      {{ t('connections.manage') }}<span class="visually-hidden">&nbsp;{{ name }}</span>
      <svg class="chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
    </button>

    <div v-show="expanded" :id="`${id}-details`" class="details">
      <p class="status" :data-status="status">
        <span class="status-label">{{ t(`connections.status.${status}`) }}</span>
        <span v-if="credential">{{ t('connections.hint', { hint: credential.hint }) }}</span>
      </p>
      <p v-if="credential?.status_detail" class="hint">
        {{ t(`connections.detail.${credential.status_detail}`) }}
      </p>

      <template v-if="provider === 'zernio' && credential">
        <h4 :id="`${id}-accounts`" class="sub-title">{{ t('connections.accountsTitle') }}</h4>
        <ul v-if="credential.meta.accounts?.length" :aria-labelledby="`${id}-accounts`">
          <li v-for="account in credential.meta.accounts" :key="account.id">
            {{
              t('connections.accountLine', {
                network: t(`draft.channels.${account.platform}`),
                name: account.username,
              })
            }}
            <span v-if="!account.active">({{ t('connections.inactive') }})</span>
          </li>
        </ul>
        <p v-else>{{ t('connections.noAccounts') }}</p>
        <div>
          <button type="button" class="button" :disabled="refreshing" @click="refreshAccounts()">
            {{ t('connections.refreshAccounts') }}
          </button>
        </div>
      </template>
      <template v-if="provider === 'brevo' && credential">
        <h4 :id="`${id}-lists`" class="sub-title">{{ t('connections.listsTitle') }}</h4>
        <ul v-if="credential.meta.lists?.length" :aria-labelledby="`${id}-lists`">
          <li v-for="list in credential.meta.lists" :key="list.id">
            {{ t('connections.listLine', { name: list.name, count: list.subscribers ?? '?' }) }}
          </li>
        </ul>
        <p v-else>{{ t('connections.noLists') }}</p>
        <h4 :id="`${id}-senders`" class="sub-title">{{ t('connections.sendersTitle') }}</h4>
        <ul v-if="credential.meta.senders?.length" :aria-labelledby="`${id}-senders`">
          <li v-for="sender in credential.meta.senders" :key="sender.id">
            {{ t('connections.senderLine', { name: sender.name, email: sender.email }) }}
            <span v-if="!sender.active">({{ t('connections.inactive') }})</span>
          </li>
        </ul>
        <p v-else>{{ t('connections.noSenders') }}</p>
        <div>
          <button type="button" class="button" :disabled="refreshing" @click="refreshAccounts()">
            {{ t('connections.refreshBrevo') }}
          </button>
        </div>
      </template>
      <template v-if="provider === 'mastodon' && credential?.meta.acct">
        <p>{{ t('connections.mastodonAccount', { acct: credential.meta.acct }) }}</p>
        <p v-if="credential.meta.max_characters" class="hint">
          {{ t('connections.mastodonLimit', { count: credential.meta.max_characters }) }}
        </p>
      </template>

      <details class="how-to">
        <summary>{{ t('connections.howTo') }}</summary>
        <ol>
          <li v-for="(step, index) in steps" :key="index">{{ step }}</li>
        </ol>
        <p>{{ t(`connections.providers.${provider}.cost`) }}</p>
        <p>
          <a :href="info.url" target="_blank" rel="noopener noreferrer">
            {{ t(`connections.providers.${provider}.link`) }}
          </a>
        </p>
      </details>

      <form v-if="canEdit" class="form key-form" @submit.prevent="save()">
        <div class="form-row">
          <label :for="`${id}-secret`">
            {{
              credential
                ? t('connections.keyLabelReplace', { provider: name })
                : t('connections.keyLabel', { provider: name })
            }}
          </label>
          <input
            :id="`${id}-secret`"
            v-model="secret"
            class="field"
            type="password"
            autocomplete="off"
            spellcheck="false"
            required
            minlength="8"
          />
        </div>
        <div v-if="provider === 'mastodon'" class="form-row">
          <label :for="`${id}-instance`">{{ t('connections.instanceLabel') }}</label>
          <input
            :id="`${id}-instance`"
            v-model="instance"
            class="field"
            type="text"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            required
            :aria-describedby="`${id}-instance-hint`"
          />
          <p :id="`${id}-instance-hint`" class="hint">{{ t('connections.instanceHint') }}</p>
        </div>
        <div class="actions">
          <button type="submit" class="button" data-variant="primary" :disabled="saving">
            {{ saving ? t('connections.saving') : t('connections.save') }}
          </button>
          <AlertDialogRoot v-if="credential">
            <AlertDialogTrigger as-child>
              <button
                type="button"
                class="button"
                :aria-label="t('connections.removeLabel', { provider: name })"
              >
                {{ t('connections.remove') }}
              </button>
            </AlertDialogTrigger>
            <AlertDialogPortal>
              <AlertDialogOverlay class="dialog-overlay" />
              <AlertDialogContent class="dialog">
                <AlertDialogTitle class="dialog-title">
                  {{ t('connections.confirmTitle', { provider: name }) }}
                </AlertDialogTitle>
                <AlertDialogDescription>{{ t('connections.confirmText') }}</AlertDialogDescription>
                <div class="dialog-actions">
                  <AlertDialogCancel class="button">{{ t('common.cancel') }}</AlertDialogCancel>
                  <AlertDialogAction class="button" data-variant="danger" @click="remove()">
                    {{ t('common.delete') }}
                  </AlertDialogAction>
                </div>
              </AlertDialogContent>
            </AlertDialogPortal>
          </AlertDialogRoot>
        </div>
      </form>
    </div>
    <p role="status" class="message" :class="{ error: isError }">{{ message }}</p>
  </section>
</template>

<style scoped>
.card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-6);
}

.card > p,
.details > p {
  margin: 0;
}

.details {
  display: grid;
  gap: var(--space-3);
}

/* Checked key: one compact row (name and status, purpose, button to open it). */
.card[data-collapsed='true'] {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-1) var(--space-4);
  padding: var(--space-3) var(--space-6);
}

.card[data-collapsed='true'] .card-header {
  justify-content: flex-start;
  gap: var(--space-2) var(--space-3);
}

.card[data-collapsed='true'] .card-header h3 {
  font-size: 1.0625rem;
}

.card[data-collapsed='true'] .purpose {
  grid-column: 1;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.card[data-collapsed='true'] .toggle {
  grid-column: 2;
  grid-row: 1 / span 2;
}

.card[data-collapsed='true'] .status {
  font-size: 0.875rem;
}

.toggle {
  justify-self: start;
}

.toggle[aria-expanded='true'] .chevron {
  transform: rotate(180deg);
}

/* Empty live region: kept in the page for announcements, out of the layout. */
.message:empty {
  position: absolute;
}

.card[data-collapsed='true'] .message {
  grid-column: 1 / -1;
}

.card-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.card-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.sub-title {
  margin: 0;
  font-size: 1rem;
}

.card ul {
  margin: 0;
  padding-inline-start: var(--space-6);
}

.need {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.status {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
}

.status-label {
  font-weight: 700;
}

/* Status is carried by the text; the color only reinforces it. */
.status[data-status='ok'] .status-label {
  color: var(--color-success);
}

.status[data-status='invalid'] .status-label {
  color: var(--color-danger);
}

.how-to summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--color-accent-text);
  min-height: 2.75rem;
  display: flex;
  align-items: center;
}

.how-to ol {
  margin: var(--space-2) 0;
  padding-inline-start: var(--space-6);
}

.how-to li + li {
  margin-top: var(--space-1);
}

.key-form {
  max-width: 32rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
