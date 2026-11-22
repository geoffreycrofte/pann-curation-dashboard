<script setup lang="ts">
import {
  DIGEST_STRINGS,
  DIGEST_TEXT_KEYS,
  isUiLang,
  NEWSLETTER_PROVIDERS,
  uiLangFor,
  type TopicConfig,
} from '@glimr/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { useWorkspace } from '../lib/workspace'
import { toast } from '../lib/toast'
import { contentLangName } from '../lib/langs'

const props = defineProps<{ topicId: string; config: TopicConfig }>()
const { t, tm, rt } = useI18n()
const id = useId()
const queryCache = useQueryCache()
const { workspaceId } = useWorkspace()

const { data: credentials } = useQuery({
  key: () => ['credentials', workspaceId.value ?? ''],
  query: () => api.credentials(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})
const weekdays = computed(() => (tm('settings.weekdays') as unknown[]).map((d) => rt(d as string)))

/** Newsletter settings, with a text slot for each language of the topic (for v-model). */
function editable(config: TopicConfig): TopicConfig['newsletter'] {
  const newsletter = structuredClone(config.newsletter)
  for (const lang of config.output_langs) {
    newsletter.lists[lang] ??= null
    newsletter.texts[lang] ??= { mirror: '', unsubscribe: '', reason: '', other: '' }
  }
  return newsletter
}
const form = ref<TopicConfig['newsletter']>(editable(props.config))
const digest = ref<TopicConfig['schedule']['digest']>(structuredClone(props.config.schedule.digest))
/** Key of the service chosen for this topic: its lists (and, for Brevo, its senders). */
const service = computed(() => credentials.value?.find((c) => c.provider === form.value.provider))
watch(
  () => props.config,
  (config) => {
    form.value = editable(config)
    digest.value = structuredClone(config.schedule.digest)
  },
)

const message = ref('')
const isError = ref(false)
const { mutate, isLoading } = useMutation({
  mutation: () =>
    api.updateConfig(props.topicId, {
      newsletter: form.value,
      schedule: { ...props.config.schedule, digest: digest.value },
    }),
  async onSuccess() {
    isError.value = false
    message.value = ''
    toast(t('common.saved'))
    await queryCache.invalidateQueries({ key: ['topic', props.topicId] })
    await queryCache.invalidateQueries({ key: ['newsletter', props.topicId] })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <form
    class="section-stack newsletter"
    :aria-labelledby="`${id}-title`"
    @submit.prevent="mutate()"
  >
    <div class="section-card">
      <h2 :id="`${id}-title`" class="section-title">{{ t('settings.newsletter') }}</h2>
      <p class="hint">{{ t('settings.newsletterHint') }}</p>
      <div class="form-row">
        <label :for="`${id}-provider`">{{ t('settings.newsletterProvider') }}</label>
        <select
          :id="`${id}-provider`"
          v-model="form.provider"
          class="field"
          :aria-describedby="`${id}-provider-hint`"
        >
          <option v-for="p in NEWSLETTER_PROVIDERS" :key="p" :value="p">
            {{ t(`connections.providers.${p}.name`) }}
          </option>
        </select>
        <p :id="`${id}-provider-hint`" class="hint">{{ t('settings.newsletterProviderHint') }}</p>
      </div>
      <p v-if="credentials && !service">
        {{ form.provider === 'sendfox' ? t('settings.noSendfox') : t('settings.noBrevo') }}
        <RouterLink to="/connections">{{ t('nav.connections') }}</RouterLink>
      </p>

      <div class="form-check">
        <input
          :id="`${id}-auto`"
          v-model="form.auto_send"
          type="checkbox"
          :aria-describedby="`${id}-auto-hint`"
        />
        <label :for="`${id}-auto`">{{ t('settings.autoSend') }}</label>
        <p :id="`${id}-auto-hint`" class="hint">{{ t('settings.autoSendHint') }}</p>
      </div>

      <div class="grid">
        <div class="form-row">
          <label :for="`${id}-weekday`">{{ t('settings.weekday') }}</label>
          <select :id="`${id}-weekday`" v-model.number="digest.weekday" class="field">
            <option v-for="(name, index) in weekdays" :key="index" :value="index">
              {{ name }}
            </option>
          </select>
        </div>
        <div class="form-row">
          <label :for="`${id}-time`">{{ t('settings.time') }}</label>
          <input
            :id="`${id}-time`"
            v-model="digest.time"
            class="field"
            type="time"
            required
            :aria-describedby="`${id}-time-hint`"
          />
          <p :id="`${id}-time-hint`" class="hint">{{ t('settings.timeHint') }}</p>
        </div>
        <div class="form-row">
          <label :for="`${id}-first`">{{ t('settings.firstIssueFrom') }}</label>
          <input
            :id="`${id}-first`"
            v-model="form.first_issue_from"
            class="field"
            type="date"
            :aria-describedby="`${id}-first-hint`"
          />
          <p :id="`${id}-first-hint`" class="hint">{{ t('settings.firstIssueFromHint') }}</p>
        </div>
        <div v-if="form.provider === 'brevo'" class="form-row sender">
          <label :for="`${id}-sender`">{{ t('settings.sender') }}</label>
          <select :id="`${id}-sender`" v-model="form.sender_id" class="field">
            <option :value="null">{{ t('settings.noSender') }}</option>
            <option
              v-for="sender in service?.meta.senders ?? []"
              :key="sender.id"
              :value="sender.id"
            >
              {{
                sender.active
                  ? t('connections.senderLine', { name: sender.name, email: sender.email })
                  : t('settings.senderInactive', {
                      sender: t('connections.senderLine', {
                        name: sender.name,
                        email: sender.email,
                      }),
                    })
              }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <fieldset v-for="lang in config.output_langs" :key="lang" class="section-card lang-block">
      <legend class="section-title">{{ contentLangName(lang) }}</legend>
      <div class="form-row">
        <label :for="`${id}-list-${lang}`">
          {{ t('settings.list', { lang: contentLangName(lang) }) }}
        </label>
        <select :id="`${id}-list-${lang}`" v-model="form.lists[lang]" class="field">
          <option :value="null">{{ t('settings.noList') }}</option>
          <option v-for="list in service?.meta.lists ?? []" :key="list.id" :value="list.id">
            {{ t('connections.listLine', { name: list.name, count: list.subscribers ?? '?' }) }}
          </option>
        </select>
      </div>
      <div class="form-row">
        <label :for="`${id}-title-${lang}`">
          {{ t('settings.newsletterTitle', { lang: contentLangName(lang) }) }}
        </label>
        <input
          :id="`${id}-title-${lang}`"
          v-model="form.title[lang]"
          class="field"
          type="text"
          maxlength="120"
          :lang="lang"
          :aria-describedby="`${id}-title-${lang}-hint`"
        />
        <p :id="`${id}-title-${lang}-hint`" class="hint">{{ t('settings.newsletterTitleHint') }}</p>
      </div>
      <div class="form-row">
        <label :for="`${id}-intro-${lang}`">
          {{ t('settings.newsletterIntro', { lang: contentLangName(lang) }) }}
        </label>
        <textarea
          :id="`${id}-intro-${lang}`"
          v-model="form.intro[lang]"
          class="field"
          rows="3"
          maxlength="2000"
          :lang="lang"
          :aria-describedby="`${id}-intro-${lang}-hint`"
        ></textarea>
        <p :id="`${id}-intro-${lang}-hint`" class="hint">{{ t('settings.newsletterIntroHint') }}</p>
      </div>
      <div class="form-row">
        <label :for="`${id}-footer-${lang}`">
          {{ t('settings.newsletterFooter', { lang: contentLangName(lang) }) }}
        </label>
        <textarea
          :id="`${id}-footer-${lang}`"
          v-model="form.footer[lang]"
          class="field"
          rows="2"
          maxlength="1000"
          :lang="lang"
          :aria-describedby="`${id}-footer-${lang}-hint`"
        ></textarea>
        <p :id="`${id}-footer-${lang}-hint`" class="hint">
          {{ t('settings.newsletterFooterHint') }}
        </p>
      </div>
      <details class="fixed-texts" :open="!isUiLang(lang.split('-')[0]!)">
        <summary>{{ t('settings.newsletterTexts') }}</summary>
        <p class="hint">{{ t('settings.newsletterTextsHint') }}</p>
        <div v-for="key in DIGEST_TEXT_KEYS" :key="key" class="form-row">
          <label :for="`${id}-text-${key}-${lang}`">
            {{ t(`settings.newsletterText.${key}`, { lang: contentLangName(lang) }) }}
          </label>
          <input
            :id="`${id}-text-${key}-${lang}`"
            v-model="form.texts[lang]![key]"
            class="field"
            type="text"
            :maxlength="key === 'reason' ? 300 : key === 'other' ? 60 : 120"
            :lang="lang"
            :placeholder="DIGEST_STRINGS[uiLangFor(lang)][key]"
          />
        </div>
      </details>
    </fieldset>

    <fieldset class="section-card">
      <legend class="section-title">{{ t('settings.newsletterLook') }}</legend>
      <div class="form-row">
        <label :for="`${id}-logo`">{{ t('settings.newsletterLogo') }}</label>
        <input
          :id="`${id}-logo`"
          v-model.trim="form.logo_url"
          class="field"
          type="url"
          inputmode="url"
          pattern="https://.*"
          placeholder="https://"
          :aria-describedby="`${id}-logo-hint`"
        />
        <p :id="`${id}-logo-hint`" class="hint">{{ t('settings.newsletterLogoHint') }}</p>
      </div>
      <div class="form-row">
        <label :for="`${id}-accent`">{{ t('settings.newsletterAccent') }}</label>
        <div class="color">
          <input
            :id="`${id}-accent`"
            v-model="form.accent_color"
            class="swatch"
            type="color"
            :aria-describedby="`${id}-accent-hint`"
          />
          <code>{{ form.accent_color }}</code>
        </div>
        <p :id="`${id}-accent-hint`" class="hint">{{ t('settings.newsletterAccentHint') }}</p>
      </div>
      <div class="form-check">
        <input
          :id="`${id}-group`"
          v-model="form.group_by_kind"
          type="checkbox"
          :aria-describedby="`${id}-group-hint`"
        />
        <label :for="`${id}-group`">{{ t('settings.newsletterGroup') }}</label>
        <p :id="`${id}-group-hint`" class="hint">{{ t('settings.newsletterGroupHint') }}</p>
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
.newsletter p {
  margin: 0;
}

.form-check label {
  font-weight: 600;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(12rem, 100%), 1fr));
  align-items: start;
  gap: var(--space-4);
}

.color {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/* The native color picker, at the size of a touch target. */
.swatch {
  width: 3rem;
  height: 2.75rem;
  padding: 2px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  cursor: pointer;
}

.sender {
  grid-column: 1 / -1;
}

.grid .field {
  width: 100%;
  min-width: 0;
}

.lang-block legend::first-letter {
  text-transform: uppercase;
}

textarea.field {
  width: 100%;
  resize: vertical;
}
</style>
