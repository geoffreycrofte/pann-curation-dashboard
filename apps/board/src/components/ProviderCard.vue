<script setup lang="ts">
import { PROVIDER_INFO, type Provider, type WorkspaceCredential } from '@glimr/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
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
import { toast } from '../lib/toast'
import Icon from './Icon.vue'

const props = defineProps<{
  provider: Provider
  workspaceId: string
  credential?: WorkspaceCredential
  canEdit: boolean
  /** A card to connect one more account (networks with several accounts). */
  adding?: boolean
}>()
const { t, tm, rt } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const info = computed(() => PROVIDER_INFO[props.provider])
// Sign-up link recommended by Glimr (affiliate), shown while the service is not connected.
const { data: affiliates } = useQuery({ key: ['affiliate-links'], query: api.affiliateLinks })
const affiliate = computed(() => affiliates.value?.[props.provider])
const name = computed(() => t(`connections.providers.${props.provider}.name`))
const steps = computed(() =>
  (tm(`connections.providers.${props.provider}.steps`) as unknown[]).map((s) => rt(s as string)),
)
const status = computed(() => props.credential?.status ?? 'none')
/** Which account this card holds, for the networks with several accounts. */
const accountLabel = computed(() => {
  const meta = props.credential?.meta
  if (!meta) return ''
  if (props.provider === 'bluesky' && meta.handle) return `@${meta.handle}`
  if (props.provider === 'mastodon') return meta.acct ?? ''
  if (props.provider === 'discord') return meta.webhook_name ?? ''
  return ''
})

// Every service folds to one row (name, status, purpose) and opens on demand: "Configure"
// for a service not set up yet, "Manage" for the others. A refused key opens right away,
// since it has to be replaced anyway.
const expanded = ref(status.value === 'invalid' && !props.adding)
const toggle = ref<HTMLButtonElement>()
const statusTone = computed(
  () => ({ ok: 'success', invalid: 'danger', unchecked: 'accent', none: undefined })[status.value],
)
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

// With a working key in place, there is no form: changing a key is deleting it, then
// giving the new one. A refused key shows the form right away, to replace it.
const showForm = computed(() => props.canEdit && (!props.credential || status.value === 'invalid'))
const secretInput = ref<HTMLInputElement>()

const secret = ref('')
const instance = ref(props.credential?.meta.instance?.replace(/^https:\/\//, '') ?? '')
const handle = ref(props.credential?.meta.handle ?? '')
const message = ref('')
const isError = ref(false)

async function refresh() {
  await queryCache.invalidateQueries({ key: ['credentials', props.workspaceId] })
}

const { mutate: save, isLoading: saving } = useMutation({
  mutation: () =>
    api.setCredential(props.workspaceId, props.provider, secret.value, {
      instance: props.provider === 'mastodon' ? instance.value : undefined,
      handle: props.provider === 'bluesky' ? handle.value : undefined,
    }),
  async onSuccess(credential) {
    secret.value = ''
    isError.value = false
    const saved = t('connections.saved', {
      provider: name.value,
      status: t(`connections.status.${credential.status}`),
    })
    // A key saved but not checked needs reading (why, what to do): it stays in the card.
    if (credential.status_detail) {
      message.value = `${saved} ${t(`connections.detail.${credential.status_detail}`)}`
    } else {
      message.value = ''
      toast(saved)
    }
    // The new account gets its own card: this one folds back for the next.
    if (props.adding) expanded.value = false
    await refresh()
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})

// The accounts are listed by a job: read them again a few seconds later.
const { mutate: refreshAccounts, isLoading: refreshing } = useMutation({
  mutation: () =>
    api.refreshCredential(props.workspaceId, props.provider as 'zernio' | 'brevo' | 'sendfox'),
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
  mutation: () =>
    api.deleteCredential(props.workspaceId, props.provider, props.credential?.account ?? ''),
  async onSuccess() {
    isError.value = false
    message.value = ''
    toast(
      t('connections.removed', {
        provider: accountLabel.value ? `${name.value} ${accountLabel.value}` : name.value,
      }),
    )
    await refresh()
    // The delete button is gone: focus goes to the field of the new key.
    await nextTick()
    secretInput.value?.focus()
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <section
    class="provider"
    :data-card="id"
    :data-expanded="expanded"
    :aria-labelledby="`${id}-name`"
  >
    <div class="provider-title">
      <h3 :id="`${id}-name`">
        {{ adding ? t('connections.addAccountTitle', { provider: name }) : name }}
        <span v-if="accountLabel" class="account">{{ accountLabel }}</span>
      </h3>
      <span v-if="!adding" class="badge" data-dot :data-tone="statusTone">
        {{ t(`connections.status.${status}`) }}
      </span>
      <span v-if="!adding && status === 'none'" class="need">
        {{ t(`connections.need.${info.need}`) }}
      </span>
    </div>
    <!-- One disclosure button, kept in place: its state is aria-expanded, focus stays on it. -->
    <button
      ref="toggle"
      type="button"
      class="button toggle"
      data-size="small"
      :aria-expanded="expanded"
      :aria-controls="`${id}-details`"
      @click="expanded = !expanded"
    >
      <template v-if="adding">{{ t('connections.addAccount') }}</template>
      <template v-else>
        {{ status === 'none' ? t('connections.configure') : t('connections.manage')
        }}<span class="visually-hidden">&nbsp;{{ name }} {{ accountLabel }}</span>
      </template>
      <svg class="chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
    </button>

    <p v-if="!adding" class="purpose">{{ t(`connections.providers.${provider}.purpose`) }}</p>

    <div v-show="expanded" :id="`${id}-details`" class="details">
      <!-- The key in place, and its deletion at the end of its line. -->
      <div v-if="credential" class="key-line">
        <p class="hint">{{ t('connections.hint', { hint: credential.hint }) }}</p>
        <AlertDialogRoot v-if="canEdit">
          <AlertDialogTrigger as-child>
            <button
              type="button"
              class="icon-button"
              data-variant="danger"
              :aria-label="t('connections.removeLabel', { provider: name })"
            >
              <Icon name="trash" :size="18" />
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
      <p v-if="status === 'invalid'" class="notice notice-inline" data-tone="danger">
        <Icon name="alert-circle" />
        <span>{{ t('connections.invalidNotice') }}</span>
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
          <button
            type="button"
            class="button"
            data-size="small"
            :disabled="refreshing"
            @click="refreshAccounts()"
          >
            {{ t('connections.refreshAccounts') }}
          </button>
        </div>
      </template>
      <template v-if="(provider === 'brevo' || provider === 'sendfox') && credential">
        <h4 :id="`${id}-lists`" class="sub-title">
          {{
            t('connections.listsTitle', { service: t(`connections.providers.${provider}.name`) })
          }}
        </h4>
        <ul v-if="credential.meta.lists?.length" :aria-labelledby="`${id}-lists`">
          <li v-for="list in credential.meta.lists" :key="list.id">
            {{ t('connections.listLine', { name: list.name, count: list.subscribers ?? '?' }) }}
          </li>
        </ul>
        <p v-else>
          {{ t('connections.noLists', { service: t(`connections.providers.${provider}.name`) }) }}
        </p>
        <template v-if="provider === 'brevo'">
          <h4 :id="`${id}-senders`" class="sub-title">{{ t('connections.sendersTitle') }}</h4>
          <ul v-if="credential.meta.senders?.length" :aria-labelledby="`${id}-senders`">
            <li v-for="sender in credential.meta.senders" :key="sender.id">
              {{ t('connections.senderLine', { name: sender.name, email: sender.email }) }}
              <span v-if="!sender.active">({{ t('connections.inactive') }})</span>
            </li>
          </ul>
          <p v-else>{{ t('connections.noSenders') }}</p>
        </template>
        <div>
          <button
            type="button"
            class="button"
            data-size="small"
            :disabled="refreshing"
            @click="refreshAccounts()"
          >
            {{
              provider === 'brevo' ? t('connections.refreshBrevo') : t('connections.refreshLists')
            }}
          </button>
        </div>
      </template>
      <p v-if="provider === 'bluesky' && credential?.meta.handle">
        {{ t('connections.blueskyAccount', { handle: credential.meta.handle }) }}
      </p>
      <p v-if="provider === 'discord' && credential?.meta.webhook_name">
        {{ t('connections.discordWebhook', { name: credential.meta.webhook_name }) }}
      </p>
      <template v-if="provider === 'mastodon' && credential?.meta.acct">
        <p>{{ t('connections.mastodonAccount', { acct: credential.meta.acct }) }}</p>
        <p v-if="credential.meta.max_characters" class="hint">
          {{ t('connections.mastodonLimit', { count: credential.meta.max_characters }) }}
        </p>
      </template>

      <p v-if="affiliate && !credential" class="affiliate">
        <a :href="affiliate" target="_blank" rel="noopener noreferrer sponsored">
          {{ t('connections.affiliate.link', { provider: name }) }}
        </a>
        <span class="hint">{{ t('connections.affiliate.disclosure') }}</span>
      </p>

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

      <form v-if="showForm" :id="`${id}-form`" class="form key-form" @submit.prevent="save()">
        <!-- Who first (account, instance), then the secret: the usual order of a sign-in. -->
        <div v-if="provider === 'bluesky'" class="form-row">
          <label :for="`${id}-handle`">{{ t('connections.handleLabel') }}</label>
          <input
            :id="`${id}-handle`"
            v-model="handle"
            class="field"
            type="text"
            autocomplete="username"
            spellcheck="false"
            required
            :aria-describedby="`${id}-handle-hint`"
          />
          <p :id="`${id}-handle-hint`" class="hint">{{ t('connections.handleHint') }}</p>
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
        <div class="form-row">
          <label :for="`${id}-secret`">
            {{
              provider === 'bluesky'
                ? t('connections.appPasswordLabel')
                : provider === 'discord'
                  ? t('connections.webhookLabel')
                  : credential
                    ? t('connections.keyLabelReplace', { provider: name })
                    : t('connections.keyLabel', { provider: name })
            }}
          </label>
          <input
            :id="`${id}-secret`"
            ref="secretInput"
            v-model="secret"
            class="field"
            type="password"
            autocomplete="off"
            spellcheck="false"
            required
            minlength="8"
          />
        </div>
      </form>

      <div v-if="showForm" class="card-footer">
        <button
          type="submit"
          :form="`${id}-form`"
          class="button"
          data-variant="primary"
          :disabled="saving"
        >
          {{ saving ? t('connections.saving') : t('connections.save') }}
        </button>
      </div>
    </div>
    <p v-if="isError && message" class="notice notice-inline" data-tone="danger" role="alert">
      <Icon name="alert-circle" />
      <span>{{ message }}</span>
    </p>
    <p role="status" class="message">{{ isError ? '' : message }}</p>
  </section>
</template>

<style scoped>
/* A row of its group: name and status, the purpose under them, the button on their right;
 * the rest opens below, across the row. */
.provider {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-1) var(--space-4);
  min-width: 0;
}

.provider > p,
.details > p {
  margin: 0;
}

.provider-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-3);
}

.provider-title h3 {
  margin: 0;
  font-size: 1.0625rem;
}

.toggle {
  grid-column: 2;
  grid-row: 1 / span 2;
}

.purpose {
  grid-column: 1;
}

.details,
.provider > .notice,
.provider > .message {
  grid-column: 1 / -1;
}

.details {
  margin-top: var(--space-3);
}

/* The account of a network with several accounts, after its name. */
.account {
  margin-inline-start: var(--space-1);
  color: var(--color-text-muted);
  font-weight: 600;
}

.need {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.purpose {
  font-size: 0.9375rem;
  color: var(--color-text-muted);
}

.chevron {
  transition: transform 0.15s;
}

.toggle[aria-expanded='true'] .chevron {
  transform: rotate(180deg);
}

.details {
  display: grid;
  gap: var(--space-3);
}

.provider > .notice {
  margin-top: var(--space-2);
}

/* Narrow: the button stays on the name's row, the purpose takes the full width. */
@media (max-width: 40rem) {
  .toggle {
    grid-row: 1;
    align-self: start;
  }

  .purpose {
    grid-column: 1 / -1;
  }
}

/* Empty live region: kept in the page for announcements, out of the layout. */
.message:empty {
  position: absolute;
}

.sub-title {
  margin: var(--space-1) 0 0;
  font-size: 1rem;
}

.provider ul {
  margin: 0;
  padding-inline-start: var(--space-6);
}

/* A disclosure, not a link to elsewhere: underlined like the inline links all the same. */
.how-to summary {
  width: fit-content;
  min-height: 1.75rem;
  color: var(--color-accent-text);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
  cursor: pointer;
}

.how-to summary:hover {
  text-decoration-thickness: 2px;
}

.how-to ol {
  margin: var(--space-2) 0;
  padding-inline-start: var(--space-6);
}

.how-to li + li {
  margin-top: var(--space-1);
}

.how-to p {
  margin: var(--space-2) 0 0;
}

.key-form {
  max-width: 32rem;
  gap: var(--space-4);
}

.card-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}

.key-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.key-line .hint {
  margin: 0;
}

@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }
}
.affiliate {
  display: grid;
  gap: var(--space-1);
  margin: 0;
}

.affiliate a {
  font-weight: 650;
}
</style>
