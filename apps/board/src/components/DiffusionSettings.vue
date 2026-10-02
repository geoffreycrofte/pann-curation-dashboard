<script setup lang="ts">
import { LANGS, type DraftChannel, type Lang, type TopicConfig } from '@pann/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { useWorkspace } from '../lib/workspace'

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

watch(
  () => props.config,
  (config) => {
    postsPerDay.value = config.schedule.posts_per_day
    slotsText.value = config.schedule.slots.join(', ')
    timezone.value = config.schedule.timezone
    langs.value = Object.fromEntries(
      config.channels.map((c) => [`${c.channel}/${c.account_id}`, [...c.langs]]),
    )
  },
  { immediate: true },
)

const accounts = computed<AccountRow[]>(() => {
  const rows: AccountRow[] = []
  const zernio = credentials.value?.find((c) => c.provider === 'zernio')
  for (const a of zernio?.meta.accounts ?? [])
    rows.push({
      key: `${a.platform}/${a.id}`,
      channel: a.platform,
      account_id: a.id,
      name: a.username,
      missing: false,
    })
  const acct = credentials.value?.find((c) => c.provider === 'mastodon')?.meta.acct
  if (acct)
    rows.push({
      key: `mastodon/${acct}`,
      channel: 'mastodon',
      account_id: acct,
      name: acct,
      missing: false,
    })
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
  langs.value = { ...langs.value, [key]: LANGS.filter((l) => current.has(l)) }
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
    }),
  async onSuccess() {
    isError.value = false
    message.value = t('common.saved')
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
          lang: t(`draft.langs.${conflicts.value[0]![1]}`),
        })
    return
  }
  mutate()
}
</script>

<template>
  <form class="form diffusion" :aria-labelledby="`${id}-title`" @submit.prevent="submit">
    <h2 :id="`${id}-title`">{{ t('settings.diffusion') }}</h2>
    <p class="hint">{{ t('settings.diffusionHint') }}</p>

    <div class="grid">
      <div class="form-row">
        <label :for="`${id}-per-day`">{{ t('settings.postsPerDay') }}</label>
        <input
          :id="`${id}-per-day`"
          v-model.number="postsPerDay"
          class="field small"
          type="number"
          min="0"
          max="10"
          step="1"
          required
          :aria-describedby="`${id}-per-day-hint`"
        />
        <p :id="`${id}-per-day-hint`" class="hint">{{ t('settings.postsPerDayHint') }}</p>
      </div>
      <div class="form-row">
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
      <div class="form-row">
        <label :for="`${id}-tz`">{{ t('settings.timezone') }}</label>
        <select v-if="TIME_ZONES.length" :id="`${id}-tz`" v-model="timezone" class="field">
          <option v-if="!TIME_ZONES.includes(timezone)" :value="timezone">{{ timezone }}</option>
          <option v-for="zone in TIME_ZONES" :key="zone" :value="zone">{{ zone }}</option>
        </select>
        <input v-else :id="`${id}-tz`" v-model="timezone" class="field" type="text" required />
      </div>
    </div>

    <fieldset :aria-describedby="`${id}-accounts-hint`">
      <legend>{{ t('settings.accounts') }}</legend>
      <p :id="`${id}-accounts-hint`" class="hint">{{ t('settings.accountsHint') }}</p>
      <p v-if="!accounts.length">
        {{ t('settings.noAccounts') }}
        <RouterLink to="/connections">{{ t('nav.connections') }}</RouterLink>
      </p>
      <ul v-else class="accounts">
        <li v-for="row in accounts" :key="row.key">
          <fieldset class="account">
            <legend>
              {{
                t('settings.accountLangs', {
                  account: t('connections.accountLine', {
                    network: t(`draft.channels.${row.channel}`),
                    name: row.name,
                  }),
                })
              }}
            </legend>
            <p v-if="row.missing" class="error">
              {{ t('settings.accountMissing', { account: row.name }) }}
            </p>
            <div class="langs">
              <label v-for="lang in LANGS" :key="lang" class="check">
                <input
                  type="checkbox"
                  :checked="langs[row.key]?.includes(lang) ?? false"
                  @change="toggle(row.key, lang, ($event.target as HTMLInputElement).checked)"
                />
                {{ t(`draft.langs.${lang}`) }}
              </label>
            </div>
          </fieldset>
        </li>
      </ul>
      <p v-for="[channel, lang] in conflicts" :key="`${channel}/${lang}`" class="error">
        {{
          t('settings.accountConflict', {
            channel: t(`draft.channels.${channel}`),
            lang: t(`draft.langs.${lang}`),
          })
        }}
      </p>
    </fieldset>

    <div>
      <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
        {{ isLoading ? t('common.saving') : t('common.save') }}
      </button>
    </div>
    <p role="status" :class="{ error: isError }">{{ message }}</p>
  </form>
</template>

<style scoped>
.diffusion {
  display: grid;
  gap: var(--space-4);
  max-width: 40rem;
  margin-top: var(--space-8);
}

.diffusion h2,
.diffusion p {
  margin: 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  align-items: start;
  gap: var(--space-4);
}

.grid .field {
  width: 100%;
  min-width: 0;
}

.small {
  max-width: 8rem;
}

fieldset {
  display: grid;
  gap: var(--space-3);
}

.accounts {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.account {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
}

.account legend {
  padding: 0 var(--space-1);
  font-weight: 650;
}

.langs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-5);
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
