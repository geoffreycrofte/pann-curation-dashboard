<script setup lang="ts">
import { NEWSLETTER_PROVIDERS, type TopicConfig } from '@pann/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { useWorkspace } from '../lib/workspace'

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

const form = ref<TopicConfig['newsletter']>(structuredClone(props.config.newsletter))
const digest = ref<TopicConfig['schedule']['digest']>(structuredClone(props.config.schedule.digest))
/** Key of the service chosen for this topic: its lists (and, for Brevo, its senders). */
const service = computed(() => credentials.value?.find((c) => c.provider === form.value.provider))
watch(
  () => props.config,
  (config) => {
    form.value = structuredClone(config.newsletter)
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
    message.value = t('common.saved')
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
  <form class="form newsletter" :aria-labelledby="`${id}-title`" @submit.prevent="mutate()">
    <h2 :id="`${id}-title`">{{ t('settings.newsletter') }}</h2>
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

    <div class="check-row">
      <input
        :id="`${id}-auto`"
        v-model="form.auto_send"
        type="checkbox"
        :aria-describedby="`${id}-auto-hint`"
      />
      <label :for="`${id}-auto`">{{ t('settings.autoSend') }}</label>
    </div>
    <p :id="`${id}-auto-hint`" class="hint">{{ t('settings.autoSendHint') }}</p>

    <div class="grid">
      <div class="form-row">
        <label :for="`${id}-weekday`">{{ t('settings.weekday') }}</label>
        <select :id="`${id}-weekday`" v-model.number="digest.weekday" class="field">
          <option v-for="(name, index) in weekdays" :key="index" :value="index">{{ name }}</option>
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
      <div v-if="form.provider === 'brevo'" class="form-row">
        <label :for="`${id}-sender`">{{ t('settings.sender') }}</label>
        <select :id="`${id}-sender`" v-model="form.sender_id" class="field">
          <option :value="null">{{ t('settings.noSender') }}</option>
          <option v-for="sender in service?.meta.senders ?? []" :key="sender.id" :value="sender.id">
            {{
              sender.active
                ? t('connections.senderLine', { name: sender.name, email: sender.email })
                : t('settings.senderInactive', {
                    sender: t('connections.senderLine', { name: sender.name, email: sender.email }),
                  })
            }}
          </option>
        </select>
      </div>
    </div>

    <fieldset v-for="lang in config.output_langs" :key="lang" class="lang-block">
      <legend>{{ t(`draft.langs.${lang}`) }}</legend>
      <div class="form-row">
        <label :for="`${id}-list-${lang}`">
          {{ t('settings.list', { lang: t(`draft.langs.${lang}`) }) }}
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
          {{ t('settings.newsletterTitle', { lang: t(`draft.langs.${lang}`) }) }}
        </label>
        <input
          :id="`${id}-title-${lang}`"
          v-model="form[lang === 'fr' ? 'title_fr' : 'title_en']"
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
          {{ t('settings.newsletterIntro', { lang: t(`draft.langs.${lang}`) }) }}
        </label>
        <textarea
          :id="`${id}-intro-${lang}`"
          v-model="form[lang === 'fr' ? 'intro_fr' : 'intro_en']"
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
          {{ t('settings.newsletterFooter', { lang: t(`draft.langs.${lang}`) }) }}
        </label>
        <textarea
          :id="`${id}-footer-${lang}`"
          v-model="form[lang === 'fr' ? 'footer_fr' : 'footer_en']"
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
    </fieldset>

    <fieldset class="lang-block">
      <legend>{{ t('settings.newsletterLook') }}</legend>
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
      <div class="check-row">
        <input
          :id="`${id}-group`"
          v-model="form.group_by_kind"
          type="checkbox"
          :aria-describedby="`${id}-group-hint`"
        />
        <label :for="`${id}-group`">{{ t('settings.newsletterGroup') }}</label>
      </div>
      <p :id="`${id}-group-hint`" class="hint">{{ t('settings.newsletterGroupHint') }}</p>
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
.newsletter {
  display: grid;
  gap: var(--space-4);
  max-width: 40rem;
  margin-top: var(--space-8);
}

.newsletter h2,
.newsletter p {
  margin: 0;
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

.grid .field {
  width: 100%;
  min-width: 0;
}

.check-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 2.75rem;
  font-weight: 600;
}

.check-row input {
  width: 1.25rem;
  height: 1.25rem;
  accent-color: var(--color-accent-text);
}

.lang-block {
  display: grid;
  gap: var(--space-4);
}

.lang-block legend::first-letter {
  text-transform: uppercase;
}

textarea.field {
  width: 100%;
  resize: vertical;
}
</style>
