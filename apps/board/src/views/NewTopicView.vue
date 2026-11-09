<script setup lang="ts">
import { LANGS, type Lang } from '@pann/shared'
import { useMutation, useQueryCache } from '@pinia/colada'
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { useWorkspace } from '../lib/workspace'

const { t } = useI18n()
const id = useId()
const router = useRouter()
const queryCache = useQueryCache()
const { workspaceId } = useWorkspace()

const nameFr = ref('')
const nameEn = ref('')
const langs = ref<Lang[]>([...LANGS])
const criteria = ref('')
const budget = ref(10)
const message = ref('')

const { mutate, isLoading } = useMutation({
  mutation: () =>
    api.createTopic({
      workspace_id: workspaceId.value!,
      name_fr: nameFr.value,
      name_en: nameEn.value,
      output_langs: langs.value,
      relevance_criteria: criteria.value,
      monthly_budget_usd: budget.value,
    }),
  async onSuccess(topic) {
    await queryCache.invalidateQueries({ key: ['topics'] })
    // Next step of the setup: the sources of the new topic.
    await router.push({ name: 'sources', params: { topicId: topic.id }, query: { new: '1' } })
  },
  onError(err) {
    message.value = describeError(err.message, t).text
  },
})

function submit() {
  if (!langs.value.length) {
    message.value = t('newTopic.langsRequired')
    return
  }
  mutate()
}
</script>

<template>
  <h1 tabindex="-1">{{ t('newTopic.title') }}</h1>
  <p class="intro">{{ t('newTopic.intro') }}</p>

  <form class="form new-topic" @submit.prevent="submit">
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

    <div class="form-row">
      <label :for="`${id}-criteria`">{{ t('settings.criteria') }}</label>
      <textarea
        :id="`${id}-criteria`"
        v-model="criteria"
        class="field"
        rows="4"
        maxlength="4000"
        :placeholder="t('settings.criteriaPlaceholder')"
        :aria-describedby="`${id}-criteria-hint`"
      ></textarea>
      <p :id="`${id}-criteria-hint`" class="hint">{{ t('newTopic.criteriaHint') }}</p>
    </div>

    <div class="form-row">
      <label :for="`${id}-budget`">{{ t('settings.budgetLabel') }}</label>
      <input
        :id="`${id}-budget`"
        v-model.number="budget"
        class="field budget"
        type="number"
        min="0"
        max="10000"
        step="1"
        required
        :aria-describedby="`${id}-budget-hint`"
      />
      <p :id="`${id}-budget-hint`" class="hint">{{ t('settings.budgetHint') }}</p>
    </div>

    <div>
      <button
        type="submit"
        class="button"
        data-variant="primary"
        :disabled="isLoading || !workspaceId"
      >
        {{ isLoading ? t('newTopic.creating') : t('newTopic.create') }}
      </button>
    </div>
    <p role="status" class="error">{{ message }}</p>
  </form>
</template>

<style scoped>
.intro {
  max-width: 40rem;
}

.new-topic {
  max-width: 40rem;
}

.new-topic fieldset {
  display: grid;
  gap: var(--space-3);
}

.new-topic legend {
  margin-bottom: var(--space-1);
}

.names {
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
}

.names .hint {
  grid-column: 1 / -1;
}

textarea.field {
  width: 100%;
  resize: vertical;
}

.budget {
  max-width: 8rem;
}

.error:empty {
  margin: 0;
}
</style>
