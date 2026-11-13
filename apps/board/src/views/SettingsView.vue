<script setup lang="ts">
import { DRAFT_MODES, kindLabel, type Lang, type TopicConfig } from '@pann/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import BudgetSection from '../components/BudgetSection.vue'
import DiffusionSettings from '../components/DiffusionSettings.vue'
import FeedSettings from '../components/FeedSettings.vue'
import NewsletterSettings from '../components/NewsletterSettings.vue'
import ProductSettings from '../components/ProductSettings.vue'
import TopicGeneralSettings from '../components/TopicGeneralSettings.vue'
import TopicKindsSettings from '../components/TopicKindsSettings.vue'
import IntervalSelect from '../components/IntervalSelect.vue'
import TopicNav from '../components/TopicNav.vue'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { useTopicName } from '../lib/topic-name'
import { toast } from '../lib/toast'

/**
 * Settings of a topic. scope "topic": what its tools share (general, product, budget);
 * scope "curation": what only the curation tool uses.
 */
const props = defineProps<{ topicId: string; scope: 'topic' | 'curation' }>()
const { t, locale } = useI18n()
const id = useId()
const queryCache = useQueryCache()
const topicName = useTopicName(() => props.topicId)

// Sub-tabs, kept in the address (?tab=…) so a section can be linked and survives a reload.
const TOPIC_TABS = ['general', 'product', 'budget'] as const
const CURATION_TABS = [
  'kinds',
  'collection',
  'triage',
  'drafting',
  'diffusion',
  'newsletter',
  'feed',
] as const
type Tab = (typeof TOPIC_TABS)[number] | (typeof CURATION_TABS)[number]
const route = useRoute()
const router = useRouter()
const tabs = computed<readonly Tab[]>(() => (props.scope === 'topic' ? TOPIC_TABS : CURATION_TABS))
const tab = computed<Tab>({
  get: () => {
    const value = route.query.tab
    return (tabs.value as readonly unknown[]).includes(value) ? (value as Tab) : tabs.value[0]!
  },
  set: (value) => void router.replace({ query: { ...route.query, tab: value } }),
})

const {
  data: topic,
  isPending,
  error,
} = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})

/** Local copy edited by the form. */
const collection = ref<TopicConfig['collection']>()
const ai = ref<TopicConfig['ai']>()
watch(
  topic,
  (value) => {
    if (!value) return
    collection.value = structuredClone(value.config.collection)
    ai.value = structuredClone(value.config.ai)
  },
  { immediate: true },
)

function setKindInterval(key: string, hours: number | null) {
  if (!collection.value) return
  if (hours) collection.value.intervals_hours[key] = hours
  else delete collection.value.intervals_hours[key]
}

/** Free-text rules of the drafting tab (field of topic.config.ai, translation key). */
const RULES = [
  { field: 'editorial_rules', label: 'editorialRules' },
  { field: 'style_rules', label: 'styleRules' },
  { field: 'post_rules', label: 'postRules' },
] as const

const message = ref('')
const isError = ref(false)
const { mutate, isLoading } = useMutation({
  mutation: () => api.updateConfig(props.topicId, { collection: collection.value, ai: ai.value }),
  async onSuccess() {
    isError.value = false
    message.value = ''
    toast(t('common.saved'))
    await queryCache.invalidateQueries({ key: ['topic', props.topicId] })
    await queryCache.invalidateQueries({ key: ['sources', props.topicId] })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <h1 tabindex="-1">
    {{
      t(scope === 'topic' ? 'settings.heading' : 'settings.curationHeading', { topic: topicName })
    }}
  </h1>
  <TopicNav v-if="scope === 'curation'" :topic-id="topicId" />
  <p
    v-if="scope === 'curation' && topic?.config.modules.curation === false"
    class="notice"
    role="note"
  >
    {{ t('modules.curationOff') }}
    <RouterLink :to="{ name: 'settings', params: { topicId } }">{{
      t('modules.turnOn')
    }}</RouterLink>
  </p>

  <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <TabsRoot v-else-if="topic && collection && ai" v-model="tab" activation-mode="manual">
    <TabsList :aria-label="t('settings.tabsLabel')" v-scroll-active class="subtabs tab-row">
      <TabsTrigger v-for="name in tabs" :key="name" :value="name" class="subtab">
        {{ t(`settings.tabs.${name}`) }}
      </TabsTrigger>
    </TabsList>

    <TabsContent value="general" class="subpanel">
      <TopicGeneralSettings :key="topic.id" :topic="topic" />
    </TabsContent>

    <TabsContent value="product" class="subpanel">
      <ProductSettings :key="topic.id" :topic="topic" />
    </TabsContent>

    <TabsContent value="kinds" class="subpanel">
      <TopicKindsSettings :key="topic.id" :topic="topic" />
    </TabsContent>

    <TabsContent value="collection" class="subpanel">
      <form class="form settings" @submit.prevent="mutate()">
        <fieldset :aria-describedby="`${id}-hint`">
          <legend>{{ t('settings.collection') }}</legend>
          <p :id="`${id}-hint`" class="hint">{{ t('settings.collectionHint') }}</p>
          <div class="grid">
            <div v-for="kind in topic.config.kinds" :key="kind.key" class="form-row">
              <label :for="`${id}-${kind.key}`">
                {{ kindLabel(topic.config, kind.key, locale as Lang) }}
              </label>
              <!-- No interval of its own: the kind follows the "Others" value. -->
              <IntervalSelect
                :id="`${id}-${kind.key}`"
                :model-value="collection.intervals_hours[kind.key] ?? null"
                :inherited-hours="collection.default_hours"
                @update:model-value="(v) => setKindInterval(kind.key, v)"
              />
            </div>
            <div class="form-row">
              <label :for="`${id}-default`">{{ t('settings.other') }}</label>
              <IntervalSelect
                :id="`${id}-default`"
                :model-value="collection.default_hours"
                @update:model-value="(v) => v && (collection!.default_hours = v)"
              />
            </div>
          </div>
        </fieldset>
        <div>
          <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
            {{ isLoading ? t('common.saving') : t('common.save') }}
          </button>
        </div>
        <p role="status" :class="{ error: isError }">{{ message }}</p>
      </form>
    </TabsContent>

    <TabsContent value="triage" class="subpanel">
      <form class="form settings" @submit.prevent="mutate()">
        <fieldset>
          <legend>{{ t('settings.triage') }}</legend>
          <div class="form-row">
            <label :for="`${id}-criteria`">{{ t('settings.criteria') }}</label>
            <textarea
              :id="`${id}-criteria`"
              v-model="ai.relevance_criteria"
              class="field"
              rows="4"
              maxlength="4000"
              :placeholder="t('settings.criteriaPlaceholder')"
              :aria-describedby="`${id}-criteria-hint`"
            ></textarea>
            <p :id="`${id}-criteria-hint`" class="hint">{{ t('settings.criteriaHint') }}</p>
          </div>
          <div class="form-row">
            <label :for="`${id}-threshold`">{{ t('settings.threshold') }}</label>
            <input
              :id="`${id}-threshold`"
              v-model.number="ai.relevance_threshold"
              class="field threshold"
              type="number"
              min="0"
              max="100"
              step="1"
              required
              :aria-describedby="`${id}-threshold-hint`"
            />
            <p :id="`${id}-threshold-hint`" class="hint">{{ t('settings.thresholdHint') }}</p>
          </div>
        </fieldset>
        <div>
          <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
            {{ isLoading ? t('common.saving') : t('common.save') }}
          </button>
        </div>
        <p role="status" :class="{ error: isError }">{{ message }}</p>
      </form>
    </TabsContent>

    <TabsContent value="drafting" class="subpanel">
      <form class="form settings" @submit.prevent="mutate()">
        <fieldset :aria-describedby="`${id}-drafting-hint`">
          <legend>{{ t('settings.drafting') }}</legend>
          <p :id="`${id}-drafting-hint`" class="hint">{{ t('settings.draftingHint') }}</p>
          <div class="form-row">
            <label :for="`${id}-draft-mode`">{{ t('settings.draftMode') }}</label>
            <select
              :id="`${id}-draft-mode`"
              v-model="ai.draft_mode"
              class="field"
              :aria-describedby="`${id}-draft-mode-hint`"
            >
              <option v-for="mode in DRAFT_MODES" :key="mode" :value="mode">
                {{ t(`settings.draftModes.${mode}`) }}
              </option>
            </select>
            <p :id="`${id}-draft-mode-hint`" class="hint">{{ t('settings.draftModeHint') }}</p>
          </div>
          <div v-for="rule in RULES" :key="rule.field" class="form-row">
            <label :for="`${id}-${rule.field}`">{{ t(`settings.${rule.label}`) }}</label>
            <textarea
              :id="`${id}-${rule.field}`"
              v-model="ai[rule.field]"
              class="field"
              rows="5"
              maxlength="4000"
              :placeholder="t(`settings.${rule.label}Placeholder`)"
              :aria-describedby="`${id}-${rule.field}-hint`"
            ></textarea>
            <p :id="`${id}-${rule.field}-hint`" class="hint">
              {{ t(`settings.${rule.label}Hint`) }}
            </p>
          </div>
        </fieldset>
        <div>
          <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
            {{ isLoading ? t('common.saving') : t('common.save') }}
          </button>
        </div>
        <p role="status" :class="{ error: isError }">{{ message }}</p>
      </form>
    </TabsContent>

    <TabsContent value="diffusion" class="subpanel">
      <DiffusionSettings :topic-id="topicId" :config="topic.config" />
    </TabsContent>
    <TabsContent value="newsletter" class="subpanel">
      <NewsletterSettings :topic-id="topicId" :config="topic.config" />
    </TabsContent>
    <TabsContent value="feed" class="subpanel">
      <FeedSettings :topic-id="topicId" :config="topic.config" :feed-key="topic.feed_key" />
    </TabsContent>
    <TabsContent value="budget" class="subpanel">
      <BudgetSection :topic-id="topicId" />
    </TabsContent>
  </TabsRoot>
</template>

<style scoped>
/* Each panel is one section: no card, the legend reads as the panel title. */
.settings {
  max-width: 40rem;
}

.settings fieldset {
  display: grid;
  gap: var(--space-4);
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
}

.settings legend {
  margin-bottom: var(--space-2);
  padding: 0;
  font-size: 1.375rem;
}

.settings p[role='status'] {
  margin: 0;
}

.subpanel :deep(.diffusion),
.subpanel :deep(.newsletter),
.subpanel :deep(.feed),
.subpanel :deep(.budget) {
  margin-top: 0;
}

textarea.field {
  width: 100%;
  resize: vertical;
}

.threshold {
  max-width: 8rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(14rem, 100%), 1fr));
  gap: var(--space-4);
  margin-top: var(--space-3);
}
</style>
