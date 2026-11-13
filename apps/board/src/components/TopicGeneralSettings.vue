<script setup lang="ts">
import { LANGS, type Lang } from '@pann/shared'
import { useMutation, useQueryCache } from '@pinia/colada'
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type TopicWithConfig } from '../lib/api'
import { describeError } from '../lib/errors'
import { toast } from '../lib/toast'

const props = defineProps<{ topic: TopicWithConfig }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const nameFr = ref(props.topic.name_fr)
const nameEn = ref(props.topic.name_en)
const langs = ref<Lang[]>([...props.topic.config.output_langs])
const curation = ref(props.topic.config.modules.curation)
const engagement = ref(props.topic.config.modules.engagement)
const message = ref('')
const isError = ref(false)

const { mutate, isLoading } = useMutation({
  mutation: async () => {
    await api.updateTopic(props.topic.id, { name_fr: nameFr.value, name_en: nameEn.value })
    await api.updateConfig(props.topic.id, {
      output_langs: langs.value,
      modules: { curation: curation.value, engagement: engagement.value },
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
  <form class="form general" @submit.prevent="submit">
    <fieldset class="names" :aria-describedby="`${id}-names-hint`">
      <legend>{{ t('newTopic.names') }}</legend>
      <p :id="`${id}-names-hint`" class="hint">{{ t('newTopic.namesHint') }}</p>
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
    </fieldset>
    <fieldset :aria-describedby="`${id}-langs-hint`">
      <legend>{{ t('newTopic.langs') }}</legend>
      <p :id="`${id}-langs-hint`" class="hint">{{ t('newTopic.langsHint') }}</p>
      <div v-for="lang in LANGS" :key="lang" class="form-check">
        <input :id="`${id}-lang-${lang}`" v-model="langs" type="checkbox" :value="lang" />
        <label :for="`${id}-lang-${lang}`">{{ t(`lang.${lang}`) }}</label>
      </div>
    </fieldset>
    <fieldset :aria-describedby="`${id}-modules-hint`">
      <legend>{{ t('modules.heading') }}</legend>
      <p :id="`${id}-modules-hint`" class="hint">{{ t('modules.hint') }}</p>
      <div class="form-check">
        <input
          :id="`${id}-curation`"
          v-model="curation"
          type="checkbox"
          :aria-describedby="`${id}-curation-hint`"
        />
        <label :for="`${id}-curation`">{{ t('modules.curation') }}</label>
      </div>
      <p :id="`${id}-curation-hint`" class="hint">{{ t('modules.curationHint') }}</p>
      <div class="form-check">
        <input
          :id="`${id}-engagement`"
          v-model="engagement"
          type="checkbox"
          :aria-describedby="`${id}-engagement-hint`"
        />
        <label :for="`${id}-engagement`">{{ t('modules.engagement') }}</label>
      </div>
      <p :id="`${id}-engagement-hint`" class="hint">{{ t('modules.engagementHint') }}</p>
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
.general {
  max-width: 40rem;
}

.general fieldset {
  display: grid;
  gap: var(--space-3);
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
}

.general legend {
  margin-bottom: var(--space-1);
  padding: 0;
  font-size: 1.375rem;
}

.names {
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
}

.names .hint {
  grid-column: 1 / -1;
}

.general p[role='status'] {
  margin: 0;
}
</style>
