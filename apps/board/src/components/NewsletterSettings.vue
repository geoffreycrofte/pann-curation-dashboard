<script setup lang="ts">
import { type TopicConfig } from '@pann/shared'
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
const brevo = computed(() => credentials.value?.find((c) => c.provider === 'brevo'))
const weekdays = computed(() => (tm('settings.weekdays') as unknown[]).map((d) => rt(d as string)))

const form = ref<TopicConfig['newsletter']>(structuredClone(props.config.newsletter))
const digest = ref<TopicConfig['schedule']['digest']>(structuredClone(props.config.schedule.digest))
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
    <p v-if="credentials && !brevo">
      {{ t('settings.noBrevo') }}
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
        <label :for="`${id}-sender`">{{ t('settings.sender') }}</label>
        <select :id="`${id}-sender`" v-model="form.sender_id" class="field">
          <option :value="null">{{ t('settings.noSender') }}</option>
          <option v-for="sender in brevo?.meta.senders ?? []" :key="sender.id" :value="sender.id">
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
          <option v-for="list in brevo?.meta.lists ?? []" :key="list.id" :value="list.id">
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
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  align-items: start;
  gap: var(--space-4);
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

textarea.field {
  width: 100%;
  resize: vertical;
}
</style>
