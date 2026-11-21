<script setup lang="ts">
import {
  FIRST_COMMENT_MAX,
  LINKEDIN_SIGNATURE_MAX,
  ZERNIO_PLATFORMS,
  type DraftChannel,
  type Lang,
  type TopicConfig,
} from '@pann/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { useWorkspace } from '../lib/workspace'
import { toast } from '../lib/toast'
import { contentLangName } from '../lib/langs'
import Icon from './Icon.vue'

const props = defineProps<{ topicId: string; config: TopicConfig }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()
const { workspaceId } = useWorkspace()

const { data: credentials } = useQuery({
  key: () => ['credentials', workspaceId.value ?? ''],
  query: () => api.credentials(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})

interface AccountRow {
  key: string
  channel: DraftChannel
  account_id: string
  name: string
  /** Set in the topic but no longer offered by Zernio. */
  missing: boolean
}

const TIME_ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf(
      'timeZone',
    )
  } catch {
    return []
  }
})()

const postsPerDay = ref(0)
const slotsText = ref('')
const timezone = ref('')
/** Languages ticked for each account (key: channel/account_id). */
const langs = ref<Record<string, Lang[]>>({})
/** LinkedIn extras, per language. */
const signature = ref<Record<Lang, string>>({ fr: '', en: '' })
const firstComment = ref<Record<Lang, string>>({ fr: '', en: '' })

watch(
  () => props.config,
  (config) => {
    postsPerDay.value = config.schedule.posts_per_day
    slotsText.value = config.schedule.slots.join(', ')
    timezone.value = config.schedule.timezone
    langs.value = Object.fromEntries(
      config.channels.map((c) => [`${c.channel}/${c.account_id}`, [...c.langs]]),
    )
    signature.value = { ...config.linkedin.signature }
    firstComment.value = { ...config.linkedin.first_comment }
  },
  { immediate: true },
)

const { data: platform } = useQuery({
  key: () => ['zernio-platform', workspaceId.value ?? ''],
  query: () => api.zernioPlatform(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})

const accounts = computed<AccountRow[]>(() => {
  const rows: AccountRow[] = []
  const zernio = credentials.value?.find((c) => c.provider === 'zernio')
  // Without a Zernio key of its own, the workspace may publish through Pann's (platform).
  if (!zernio && platform.value?.enabled)
    for (const a of platform.value.accounts)
      rows.push({
        key: `${a.platform}/${a.id}`,
        channel: a.platform,
        account_id: a.id,
        name: a.username,
        missing: false,
      })
  // Accounts listed before Bluesky and Discord went direct (or X was left out) are skipped.
  for (const a of zernio?.meta.accounts ?? []) {
    if (!(a.platform in ZERNIO_PLATFORMS)) continue
    rows.push({
      key: `${a.platform}/${a.id}`,
      channel: a.platform,
      account_id: a.id,
      name: a.username,
      missing: false,
    })
  }
  // Published directly: as many accounts as the workspace connected (Connections page).
  for (const c of credentials.value ?? []) {
    if (!c.account) continue
    const name =
      c.provider === 'bluesky'
        ? `@${c.meta.handle ?? c.account}`
        : c.provider === 'discord'
          ? (c.meta.webhook_name ?? 'Discord')
          : c.account
    if (c.provider === 'bluesky' || c.provider === 'mastodon' || c.provider === 'discord')
      rows.push({
        key: `${c.provider}/${c.account}`,
        channel: c.provider,
        account_id: c.account,
        name,
        missing: false,
      })
  }
  // Accounts set in the topic that the services no longer list stay visible.
  for (const c of props.config.channels) {
    const key = `${c.channel}/${c.account_id}`
    if (!rows.some((r) => r.key === key))
      rows.push({
        key,
        channel: c.channel,
        account_id: c.account_id,
        name: c.account_id,
        missing: true,
      })
  }
  return rows
})

/** LinkedIn extras are shown once the workspace has a LinkedIn account. */
const hasLinkedin = computed(() => accounts.value.some((row) => row.channel === 'linkedin'))
const linkedinLangs = computed(() => props.config.output_langs)
/** Languages an account can publish: those of the topic, plus any still ticked. */
const accountLangs = computed(() => [
  ...new Set([...props.config.output_langs, ...props.config.channels.flatMap((c) => c.langs)]),
])

const slots = computed(() =>
  slotsText.value
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean),
)
const slotsValid = computed(() => slots.value.every((s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s)))

const conflicts = computed(() => {
  const seen = new Map<string, number>()
  for (const row of accounts.value)
    for (const lang of langs.value[row.key] ?? [])
      seen.set(`${row.channel}/${lang}`, (seen.get(`${row.channel}/${lang}`) ?? 0) + 1)
  return [...seen].filter(([, n]) => n > 1).map(([key]) => key.split('/') as [DraftChannel, Lang])
})

function toggle(key: string, lang: Lang, on: boolean) {
  const current = new Set(langs.value[key] ?? [])
  if (on) current.add(lang)
  else current.delete(lang)
  langs.value = { ...langs.value, [key]: accountLangs.value.filter((l) => current.has(l)) }
}

const message = ref('')
const isError = ref(false)
const { mutate, isLoading } = useMutation({
  mutation: () =>
    api.updateConfig(props.topicId, {
      schedule: {
        ...props.config.schedule,
        posts_per_day: postsPerDay.value,
        slots: slots.value,
        timezone: timezone.value,
      },
      channels: accounts.value
        .filter((row) => langs.value[row.key]?.length)
        .map((row) => ({
          channel: row.channel,
          account_id: row.account_id,
          langs: langs.value[row.key]!,
        })),
      linkedin: {
        signature: { ...signature.value },
        first_comment: { ...firstComment.value },
      },
    }),
  async onSuccess() {
    isError.value = false
    message.value = ''
    toast(t('common.saved'))
    await queryCache.invalidateQueries({ key: ['topic', props.topicId] })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})

function submit() {
  if (!slotsValid.value || conflicts.value.length) {
    isError.value = true
    message.value = !slotsValid.value
      ? t('settings.slotsInvalid')
      : t('settings.accountConflict', {
          channel: t(`draft.channels.${conflicts.value[0]![0]}`),
          lang: contentLangName(conflicts.value[0]![1]),
        })
    return
  }
  mutate()
}
</script>

<template>
  <form class="section-stack diffusion" @submit.prevent="submit">
    <section class="section-card" :aria-labelledby="`${id}-title`">
      <h2 :id="`${id}-title`" class="section-title">{{ t('settings.diffusion') }}</h2>
      <p class="hint">{{ t('settings.diffusionHint') }}</p>
      <div class="schedule">
        <div class="form-row per-day">
          <label :for="`${id}-per-day`">{{ t('settings.postsPerDay') }}</label>
          <input
            :id="`${id}-per-day`"
            v-model.number="postsPerDay"
            class="field"
            type="number"
            min="0"
            max="10"
            step="1"
            required
            :aria-describedby="`${id}-per-day-hint`"
          />
          <p :id="`${id}-per-day-hint`" class="hint">{{ t('settings.postsPerDayHint') }}</p>
        </div>
        <div class="form-row slots">
          <label :for="`${id}-slots`">{{ t('settings.slots') }}</label>
          <input
            :id="`${id}-slots`"
            v-model="slotsText"
            class="field"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            :aria-invalid="!slotsValid || undefined"
            :aria-describedby="`${id}-slots-hint`"
          />
          <p :id="`${id}-slots-hint`" class="hint">{{ t('settings.slotsHint') }}</p>
        </div>
        <div class="form-row tz">
          <label :for="`${id}-tz`">{{ t('settings.timezone') }}</label>
          <select v-if="TIME_ZONES.length" :id="`${id}-tz`" v-model="timezone" class="field">
            <option v-if="!TIME_ZONES.includes(timezone)" :value="timezone">{{ timezone }}</option>
            <option v-for="zone in TIME_ZONES" :key="zone" :value="zone">{{ zone }}</option>
          </select>
          <input v-else :id="`${id}-tz`" v-model="timezone" class="field" type="text" required />
        </div>
      </div>
    </section>

    <fieldset class="section-card" :aria-describedby="`${id}-accounts-hint`">
      <legend class="section-title">{{ t('settings.accounts') }}</legend>
      <p :id="`${id}-accounts-hint`" class="hint">{{ t('settings.accountsHint') }}</p>
      <p v-if="!accounts.length">
        {{ t('settings.noAccounts') }}
        <RouterLink to="/connections">{{ t('nav.connections') }}</RouterLink>
      </p>
      <ul v-else class="accounts">
        <li v-for="row in accounts" :key="row.key">
          <fieldset class="account">
            <legend class="account-name">
              {{
                t('settings.accountLangs', {
                  account: t('connections.accountLine', {
                    network: t(`draft.channels.${row.channel}`),
                    name: row.name,
                  }),
                })
              }}
            </legend>
            <p v-if="row.missing" class="notice notice-inline" data-tone="danger">
              <Icon name="alert-circle" />
              <span>{{ t('settings.accountMissing', { account: row.name }) }}</span>
            </p>
            <div class="langs">
              <label v-for="lang in accountLangs" :key="lang" class="check">
                <input
                  type="checkbox"
                  :checked="langs[row.key]?.includes(lang) ?? false"
                  @change="toggle(row.key, lang, ($event.target as HTMLInputElement).checked)"
                />
                {{ contentLangName(lang) }}
              </label>
            </div>
          </fieldset>
        </li>
      </ul>
      <p
        v-for="[channel, lang] in conflicts"
        :key="`${channel}/${lang}`"
        class="notice notice-inline"
        data-tone="danger"
      >
        <Icon name="alert-circle" />
        <span>
          {{
            t('settings.accountConflict', {
              channel: t(`draft.channels.${channel}`),
              lang: contentLangName(lang),
            })
          }}
        </span>
      </p>
    </fieldset>

    <fieldset
      v-if="hasLinkedin"
      class="section-card linkedin"
      :aria-describedby="`${id}-linkedin-hint`"
    >
      <legend class="section-title">{{ t('settings.linkedin.title') }}</legend>
      <p :id="`${id}-linkedin-hint`" class="hint">{{ t('settings.linkedin.hint') }}</p>
      <!-- Per language: the signature, then the first comment, each with its help. -->
      <div v-for="lang in linkedinLangs" :key="lang" class="subsection">
        <div class="form-row">
          <label :for="`${id}-signature-${lang}`">
            {{ t('settings.linkedin.signature', { lang: contentLangName(lang) }) }}
          </label>
          <textarea
            :id="`${id}-signature-${lang}`"
            v-model="signature[lang]"
            class="field"
            rows="3"
            :lang="lang"
            :maxlength="LINKEDIN_SIGNATURE_MAX"
            :aria-describedby="`${id}-signature-hint-${lang}`"
          ></textarea>
          <p :id="`${id}-signature-hint-${lang}`" class="hint">
            {{ t('settings.linkedin.signatureHint') }}
          </p>
        </div>
        <div class="form-row">
          <label :for="`${id}-comment-${lang}`">
            {{ t('settings.linkedin.firstComment', { lang: contentLangName(lang) }) }}
          </label>
          <textarea
            :id="`${id}-comment-${lang}`"
            v-model="firstComment[lang]"
            class="field"
            rows="3"
            :lang="lang"
            :maxlength="FIRST_COMMENT_MAX"
            :aria-describedby="`${id}-comment-hint-${lang}`"
          ></textarea>
          <p :id="`${id}-comment-hint-${lang}`" class="hint">
            {{ t('settings.linkedin.firstCommentHint') }}
          </p>
        </div>
      </div>
    </fieldset>

    <div class="section-actions">
      <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
        {{ isLoading ? t('common.saving') : t('common.save') }}
      </button>
      <p role="status" :class="{ error: isError }">{{ message }}</p>
    </div>
  </form>
</template>

<style scoped>
/* Posts per day stays narrow; the slots and the time zone take the room left, and a
 * long zone name ("America/Argentina/Buenos_Aires") is never cut. */
.schedule {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  gap: var(--space-4);
}

.per-day {
  flex: 0 1 10rem;
}

.slots {
  flex: 1 1 12rem;
}

.tz {
  flex: 1 1 16rem;
}

.schedule .field {
  width: 100%;
}

.per-day .field {
  max-width: 8rem;
}

/* Accounts as a bordered list: the account, then its languages, one row each. */
.accounts {
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  list-style: none;
}

.accounts > li + li {
  border-top: 1px solid var(--color-border-subtle);
}

.account {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
  margin: 0;
  padding: var(--space-3) var(--space-4) var(--space-1);
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
}

.account-name {
  float: left;
  width: 100%;
  padding: 0;
  font-family: inherit;
  font-size: 1rem;
  font-weight: 650;
}

.langs {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-5);
}

.linkedin .subsection:first-of-type {
  padding-top: 0;
  border-top: 0;
}

.linkedin textarea {
  width: 100%;
  resize: vertical;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 2.75rem;
}

.check input {
  width: 1.25rem;
  height: 1.25rem;
  accent-color: var(--color-accent-text);
}
</style>
