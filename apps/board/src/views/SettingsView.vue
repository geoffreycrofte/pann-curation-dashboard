<script setup lang="ts">
import { DRAFT_MODES, kindLabel, type Lang, type TopicConfig } from '@pann/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
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
import EngagementSettings from '../components/EngagementSettings.vue'
import EngagementSources from '../components/EngagementSources.vue'
import ComposeSettings from '../components/compose/ComposeSettings.vue'
import VoiceFromPosts from '../components/voice/VoiceFromPosts.vue'
import SourcesPanel from '../components/SourcesPanel.vue'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { useTopicName } from '../lib/topic-name'
import { toast } from '../lib/toast'

/**
 * Every setting of a topic, grouped by subject whatever the tool: a tab per subject,
 * shown when a tool that uses it is on.
 */
const props = defineProps<{ topicId: string }>()
const { t, locale } = useI18n()
const id = useId()
const queryCache = useQueryCache()
const topicName = useTopicName(() => props.topicId)

// Tabs, kept in the address (?tab=…) so a section can be linked and survives a reload.
const ALL_TABS = [
  'general',
  'product',
  'sources',
  'triage',
  'voice',
  'publishing',
  'newsletter',
  'feed',
  'conversations',
  'compose',
  'budget',
] as const
type Tab = (typeof ALL_TABS)[number]
/** Tabs used by one tool only: hidden while that tool is off. */
const CURATION_ONLY: readonly Tab[] = ['triage', 'newsletter', 'feed']
/** Writing and publishing posts: the news watch and Création both do. */
const POSTS_ONLY: readonly Tab[] = ['voice', 'publishing']
const ENGAGEMENT_ONLY: readonly Tab[] = ['conversations']
const COMPOSE_ONLY: readonly Tab[] = ['compose']

const route = useRoute()
const router = useRouter()
const tabs = computed<readonly Tab[]>(() => {
  const modules = topic.value?.config.modules ?? {
    curation: true,
    engagement: false,
    compose: false,
  }
  return ALL_TABS.filter(
    (name) =>
      (modules.curation || !CURATION_ONLY.includes(name)) &&
      (modules.engagement || !ENGAGEMENT_ONLY.includes(name)) &&
      (modules.compose || !COMPOSE_ONLY.includes(name)) &&
      (modules.curation || modules.compose || !POSTS_ONLY.includes(name)),
  )
})
// Wide screens: the sections as a vertical list beside the panel. Narrower: a select
// above it (ten tabs do not fit on one line, and a scrolling row hides most of them).
const wideQuery = window.matchMedia('(min-width: 72rem)')
const wide = ref(wideQuery.matches)
const onWideChange = (event: MediaQueryListEvent) => (wide.value = event.matches)
wideQuery.addEventListener('change', onWideChange)
onBeforeUnmount(() => wideQuery.removeEventListener('change', onWideChange))

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

// "Adjust with the assistant": offered while Pann's assistant can run for this workspace.
const { data: assistant } = useQuery({
  key: () => ['onboarding-available', topic.value?.workspace_id ?? ''],
  query: () => api.onboardingAvailable(topic.value!.workspace_id),
  enabled: () => !!topic.value,
})

/** Local copy edited by the form. */
const collection = ref<TopicConfig['collection']>()
const ai = ref<TopicConfig['ai']>()
const accessibilityCheck = ref(true)
watch(
  topic,
  (value) => {
    if (!value) return
    collection.value = structuredClone(value.config.collection)
    ai.value = structuredClone(value.config.ai)
    accessibilityCheck.value = value.config.accessibility_check
  },
  { immediate: true },
)

function setKindInterval(key: string, hours: number | null) {
  if (!collection.value) return
  if (hours) collection.value.intervals_hours[key] = hours
  else delete collection.value.intervals_hours[key]
}

/** A rule proposed from the person's posts fills its field; saving stays theirs. */
async function applyVoice(field: 'style_rules' | 'post_rules', value: string) {
  if (!ai.value) return
  ai.value[field] = value
  message.value = t('voice.applied')
  isError.value = false
  await nextTick()
  document.getElementById(`${id}-${field}`)?.focus()
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
  mutation: () =>
    api.updateConfig(props.topicId, {
      collection: collection.value,
      ai: ai.value,
      accessibility_check: accessibilityCheck.value,
    }),
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
  <div class="head">
    <h1 tabindex="-1">{{ t('settings.heading', { topic: topicName }) }}</h1>
    <RouterLink
      v-if="assistant?.available"
      class="button"
      :to="{ name: 'adjust', params: { topicId } }"
    >
      {{ t('adjust.open') }}
    </RouterLink>
  </div>

  <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <TabsRoot
    v-else-if="topic && collection && ai"
    v-model="tab"
    activation-mode="manual"
    :orientation="wide ? 'vertical' : 'horizontal'"
    class="layout"
  >
    <TabsList v-if="wide" :aria-label="t('settings.tabsLabel')" class="side">
      <TabsTrigger v-for="name in tabs" :key="name" :value="name" class="side-tab">
        {{ t(`settings.tabs.${name}`) }}
      </TabsTrigger>
    </TabsList>
    <div v-else class="form-row picker">
      <label :for="`${id}-section`">{{ t('settings.section') }}</label>
      <select :id="`${id}-section`" v-model="tab" class="field">
        <option v-for="name in tabs" :key="name" :value="name">
          {{ t(`settings.tabs.${name}`) }}
        </option>
      </select>
    </div>

    <TabsContent value="general" class="subpanel">
      <TopicGeneralSettings :key="topic.id" :topic="topic" />
    </TabsContent>

    <TabsContent value="product" class="subpanel">
      <ProductSettings :key="topic.id" :topic="topic" />
    </TabsContent>

    <TabsContent value="sources" class="subpanel">
      <section v-if="topic.config.modules.curation" :aria-labelledby="`${id}-curation-sources`">
        <h2 :id="`${id}-curation-sources`">{{ t('settings.curationSources') }}</h2>
        <SourcesPanel :topic-id="topicId" />
      </section>
      <section v-if="topic.config.modules.engagement" :aria-labelledby="`${id}-engagement-sources`">
        <h2 :id="`${id}-engagement-sources`">{{ t('settings.engagementSources') }}</h2>
        <EngagementSources :topic-id="topicId" />
      </section>
    </TabsContent>

    <!-- Triage: what the topic keeps, its kinds of content and how often each is collected. -->
    <TabsContent value="triage" class="subpanel stack">
      <TopicKindsSettings :key="topic.id" :topic="topic" />
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

    <TabsContent value="voice" class="subpanel">
      <VoiceFromPosts :topic-id="topicId" :current="ai" @apply="applyVoice" />
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
          <div class="form-check">
            <input
              :id="`${id}-a11y-check`"
              v-model="accessibilityCheck"
              type="checkbox"
              :aria-describedby="`${id}-a11y-check-hint`"
            />
            <label :for="`${id}-a11y-check`">{{ t('postChecks.setting') }}</label>
          </div>
          <p :id="`${id}-a11y-check-hint`" class="hint">{{ t('postChecks.settingHint') }}</p>
        </fieldset>
        <div>
          <button type="submit" class="button" data-variant="primary" :disabled="isLoading">
            {{ isLoading ? t('common.saving') : t('common.save') }}
          </button>
        </div>
        <p role="status" :class="{ error: isError }">{{ message }}</p>
      </form>
    </TabsContent>

    <TabsContent value="publishing" class="subpanel">
      <DiffusionSettings :topic-id="topicId" :config="topic.config" />
    </TabsContent>
    <TabsContent value="newsletter" class="subpanel">
      <NewsletterSettings :topic-id="topicId" :config="topic.config" />
    </TabsContent>
    <TabsContent value="feed" class="subpanel">
      <FeedSettings :topic-id="topicId" :config="topic.config" :feed-key="topic.feed_key" />
    </TabsContent>
    <TabsContent value="conversations" class="subpanel">
      <EngagementSettings :key="topic.id" :topic="topic" />
    </TabsContent>
    <TabsContent value="compose" class="subpanel">
      <ComposeSettings :key="topic.id" :topic="topic" />
    </TabsContent>
    <TabsContent value="budget" class="subpanel">
      <BudgetSection :topic-id="topicId" />
    </TabsContent>
  </TabsRoot>
</template>

<style scoped>
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3) var(--space-5);
  margin-bottom: var(--space-6);
}

.head h1 {
  margin: 0;
}

.layout {
  display: grid;
  gap: var(--space-6);
}

@media (min-width: 72rem) {
  .layout {
    grid-template-columns: 13rem minmax(0, 1fr);
    align-items: start;
    gap: var(--space-8);
  }

  /* Explicit cells: the hidden panels must not push the open one under the list. */
  .side {
    grid-area: 1 / 1;
  }

  .layout > .subpanel {
    grid-area: 1 / 2;
  }
}

/* Sections as a vertical list: a gold bar beside the current one, and bold text. */
.side {
  position: sticky;
  top: var(--space-4);
  display: grid;
  border-inline-start: 1px solid var(--color-border);
}

.side-tab {
  min-height: 2.75rem;
  margin-inline-start: -1px;
  padding: var(--space-2) var(--space-4);
  border: 0;
  border-inline-start: 4px solid transparent;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  font-weight: 600;
  text-align: start;
  cursor: pointer;
}

.side-tab:hover {
  border-inline-start-color: var(--color-border-subtle);
  color: var(--color-text);
}

.side-tab[data-state='active'] {
  border-inline-start-color: var(--color-accent-fill);
  color: var(--color-text);
  font-weight: 750;
}

@media (forced-colors: active) {
  .side-tab[data-state='active'] {
    border-inline-start-color: Highlight;
  }
}

.picker {
  max-width: 24rem;
}

/* Several forms in one tab (triage: kinds, collection, criteria). */
.stack {
  display: grid;
  gap: var(--space-8);
}

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
