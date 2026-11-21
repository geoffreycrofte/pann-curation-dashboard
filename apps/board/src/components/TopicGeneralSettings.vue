<script setup lang="ts">
import { useMutation, useQueryCache } from '@pinia/colada'
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type TopicWithConfig } from '../lib/api'
import { describeError } from '../lib/errors'
import { toast } from '../lib/toast'
import ContentLangsPicker from './ContentLangsPicker.vue'

const props = defineProps<{ topic: TopicWithConfig }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const nameFr = ref(props.topic.name_fr)
const nameEn = ref(props.topic.name_en)
const langs = ref<string[]>([...props.topic.config.output_langs])
const curation = ref(props.topic.config.modules.curation)
const engagement = ref(props.topic.config.modules.engagement)
const compose = ref(props.topic.config.modules.compose)
/** The three tools of a topic, each a checkbox with its description. */
const TOOLS = [
  { key: 'curation', model: curation },
  { key: 'engagement', model: engagement },
  { key: 'compose', model: compose },
] as const
const message = ref('')
const isError = ref(false)

const { mutate, isLoading } = useMutation({
  mutation: async () => {
    await api.updateTopic(props.topic.id, { name_fr: nameFr.value, name_en: nameEn.value })
    await api.updateConfig(props.topic.id, {
      output_langs: langs.value,
      modules: {
        curation: curation.value,
        engagement: engagement.value,
        compose: compose.value,
      },
    })
  },
  async onSuccess() {
    isError.value = false
    message.value = ''
    toast(t('common.saved'))
    await queryCache.invalidateQueries({ key: ['topics'] })
    await queryCache.invalidateQueries({ key: ['topic', props.topic.id] })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})

function submit() {
  if (!langs.value.length) {
    isError.value = true
    message.value = t('newTopic.langsRequired')
    return
  }
  mutate()
}
</script>

<template>
  <form class="section-stack general" @submit.prevent="submit">
    <fieldset class="section-card" :aria-describedby="`${id}-names-hint`">
      <legend class="section-title">{{ t('newTopic.names') }}</legend>
      <p :id="`${id}-names-hint`" class="hint">{{ t('newTopic.namesHint') }}</p>
      <div class="names">
        <div class="form-row">
          <label :for="`${id}-fr`">{{ t('newTopic.nameFr') }}</label>
          <input
            :id="`${id}-fr`"
            v-model="nameFr"
            class="field"
            type="text"
            lang="fr"
            required
            maxlength="100"
          />
        </div>
        <div class="form-row">
          <label :for="`${id}-en`">{{ t('newTopic.nameEn') }}</label>
          <input
            :id="`${id}-en`"
            v-model="nameEn"
            class="field"
            type="text"
            lang="en"
            required
            maxlength="100"
          />
        </div>
      </div>
    </fieldset>
    <ContentLangsPicker
      v-model="langs"
      card
      :legend="t('newTopic.langs')"
      :hint="t('newTopic.langsHint')"
    />
    <fieldset class="section-card" :aria-describedby="`${id}-modules-hint`">
      <legend class="section-title">{{ t('modules.heading') }}</legend>
      <p :id="`${id}-modules-hint`" class="hint">{{ t('modules.hint') }}</p>
      <!-- Each tool: its box, its name, and what it does right under the name. -->
      <div v-for="tool in TOOLS" :key="tool.key" class="form-check tool">
        <input
          :id="`${id}-${tool.key}`"
          v-model="tool.model.value"
          type="checkbox"
          :aria-describedby="`${id}-${tool.key}-hint`"
        />
        <label :for="`${id}-${tool.key}`">{{ t(`modules.${tool.key}`) }}</label>
        <p :id="`${id}-${tool.key}-hint`" class="hint">{{ t(`modules.${tool.key}Hint`) }}</p>
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
.names {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--space-4);
}

.tool {
  row-gap: var(--space-1);
}

.tool label {
  font-weight: 650;
}
</style>
