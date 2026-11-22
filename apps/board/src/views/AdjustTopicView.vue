<script setup lang="ts">
import Icon from '../components/Icon.vue'
/**
 * "Adjust with the assistant": the same assistant as at creation, on an existing topic.
 * It knows the current settings and proposes changes; the person then sees each change
 * next to the current value, edits it if needed, and applies only those they keep.
 * Nothing changes before "Apply". Runs on Glimr's assistant credit, like the creation.
 */
import { canonicalLang, MAX_OUTPUT_LANGS, type TopicConfig } from '@glimr/shared'
import { useQuery, useQueryCache } from '@pinia/colada'
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import OnboardingChat from '../components/OnboardingChat.vue'
import FullScreen from '../components/onboarding/FullScreen.vue'
import {
  api,
  type OnboardingContext,
  type OnboardingProposal,
  type OnboardingSession,
} from '../lib/api'
import { describeError } from '../lib/errors'
import { contentLangName } from '../lib/langs'
import { toast } from '../lib/toast'
import { useTopicName } from '../lib/topic-name'

const props = defineProps<{ topicId: string }>()
const { t, locale } = useI18n()
const id = useId()
const route = useRoute()
const router = useRouter()
const queryCache = useQueryCache()
const topicName = useTopicName(() => props.topicId)

const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const { data: assistant } = useQuery({
  key: () => ['onboarding-available', topic.value?.workspace_id ?? ''],
  query: () => api.onboardingAvailable(topic.value!.workspace_id),
  enabled: () => !!topic.value,
})

// The session survives a reload (this tab only), so the comparison can be reopened.
const storageKey = () => `glimr.adjust.${props.topicId}`
const sessionId = ref(read(storageKey()))
watch(sessionId, (value) => write(storageKey(), value))
function read(key: string) {
  try {
    return sessionStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}
function write(key: string, value: string) {
  try {
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch {
    // storage unavailable: the session lives until the page is left
  }
}

const mode = computed(() => (route.query.step === 'compare' ? 'compare' : 'chat'))
const unavailable = ref(false)
const proposal = ref<Partial<OnboardingProposal>>({})

// Settings the assistant may change, where they live in the config ---------------------
type Field =
  | 'description'
  | 'audience'
  | 'messages'
  | 'claims_to_avoid'
  | 'output_langs'
  | 'relevance_criteria'
  | 'engagement_criteria'
  | 'style_rules'
  | 'post_rules'

function currentValue(config: TopicConfig, field: Field): string {
  switch (field) {
    case 'description':
    case 'audience':
    case 'messages':
    case 'claims_to_avoid':
      return config.product[field]
    case 'output_langs':
      return config.output_langs.join(', ')
    case 'relevance_criteria':
    case 'style_rules':
    case 'post_rules':
      return config.ai[field]
    case 'engagement_criteria':
      return config.engagement.criteria
  }
}

/** Only the settings of the tools that are on. */
const fields = computed<Field[]>(() => {
  const modules = topic.value?.config.modules
  return [
    'description',
    'audience',
    'messages',
    'claims_to_avoid',
    'output_langs',
    ...(modules?.curation ? (['relevance_criteria'] as const) : []),
    ...(modules?.engagement ? (['engagement_criteria'] as const) : []),
    ...(modules?.curation || modules?.compose ? (['style_rules', 'post_rules'] as const) : []),
  ]
})

const context = computed<OnboardingContext | null>(() => {
  const value = topic.value
  if (!value) return null
  const config = value.config
  return {
    name: config.product.name || topicName.value,
    url: config.product.url || undefined,
    tools: [
      ...(config.modules.curation ? (['curation'] as const) : []),
      ...(config.modules.engagement ? (['engagement'] as const) : []),
      ...(config.modules.compose ? (['compose'] as const) : []),
    ],
    channels: [...new Set([...config.channels.map((c) => c.channel), ...config.target_channels])],
    listen: [],
    ui_lang: locale.value === 'en' ? 'en' : 'fr',
    current: Object.fromEntries(fields.value.map((f) => [f, currentValue(config, f)])),
  }
})

// Comparison ----------------------------------------------------------------------------
interface Change {
  field: Field
  before: string
  after: string
  apply: boolean
}
const changes = ref<Change[]>([])

function proposedLangs(): string[] {
  return [
    ...new Set((proposal.value.output_langs ?? []).map(canonicalLang).filter((l) => l !== null)),
  ].slice(0, MAX_OUTPUT_LANGS)
}

function buildChanges() {
  const config = topic.value?.config
  if (!config) return
  changes.value = fields.value.flatMap((field) => {
    const before = currentValue(config, field)
    const after =
      field === 'output_langs' ? proposedLangs().join(', ') : (proposal.value[field] ?? '').trim()
    return after && after !== before.trim() ? [{ field, before, after, apply: true }] : []
  })
}

const label = (field: Field) =>
  ({
    description: t('product.fields.description.label'),
    audience: t('product.fields.audience.label'),
    messages: t('product.fields.messages.label'),
    claims_to_avoid: t('product.fields.claims_to_avoid.label'),
    output_langs: t('newTopic.langs'),
    relevance_criteria: t('settings.criteria'),
    engagement_criteria: t('engagement.settings.criteria'),
    style_rules: t('settings.styleRules'),
    post_rules: t('settings.postRules'),
  })[field]
const langNames = (value: string) =>
  value
    .split(/,\s*/)
    .filter(Boolean)
    .map((lang) => contentLangName(lang))
    .join(', ')

async function onProposal(session: OnboardingSession) {
  proposal.value = session.proposal
}
async function toCompare() {
  // The latest proposal, also after a reload on the comparison.
  if (sessionId.value) {
    const session = await api.onboardingSession(sessionId.value).catch(() => null)
    if (session) proposal.value = session.proposal
  }
  buildChanges()
  await router.push({ query: { step: 'compare' } })
}
watch(
  [mode, topic],
  ([value, loaded]) => {
    if (value === 'compare' && loaded && !changes.value.length) void toCompare()
  },
  { immediate: true },
)

const applying = ref(false)
const applyError = ref('')
async function apply() {
  const config = topic.value?.config
  const kept = changes.value.filter((c) => c.apply)
  if (!config || !kept.length) return
  applying.value = true
  applyError.value = ''
  const product = { ...config.product }
  const ai = { ...config.ai }
  const engagement = { ...config.engagement }
  let outputLangs = config.output_langs
  for (const { field, after } of kept) {
    if (field === 'output_langs') outputLangs = after.split(/,\s*/).filter(Boolean)
    else if (field === 'engagement_criteria') engagement.criteria = after
    else if (field === 'relevance_criteria' || field === 'style_rules' || field === 'post_rules')
      ai[field] = after
    else product[field] = after
  }
  try {
    await api.updateConfig(props.topicId, {
      product,
      ai,
      engagement,
      output_langs: outputLangs,
    })
    await queryCache.invalidateQueries({ key: ['topic', props.topicId] })
    sessionId.value = ''
    toast(t('adjust.applied', kept.length))
    await router.push({ name: 'settings', params: { topicId: props.topicId } })
  } catch (err) {
    applyError.value = describeError((err as Error).message, t).text
    await nextTick()
    document.getElementById(`${id}-apply-error`)?.focus()
  } finally {
    applying.value = false
  }
}

function restart() {
  sessionId.value = ''
  proposal.value = {}
  changes.value = []
  void router.push({ query: {} })
}
function quit() {
  void router.push({ name: 'settings', params: { topicId: props.topicId } })
}
</script>

<template>
  <FullScreen
    :status="mode === 'compare' ? t('adjust.statusCompare') : t('adjust.statusChat')"
    :nav-label="t('adjust.navLabel')"
  >
    <template #links>
      <button type="button" class="button" @click="quit">{{ t('adjust.quit') }}</button>
    </template>

    <template v-if="mode === 'chat'">
      <h1 tabindex="-1">{{ t('adjust.title', { topic: topicName }) }}</h1>
      <p class="lead">{{ t('adjust.intro') }}</p>
      <div v-if="unavailable || assistant?.available === false" class="notice" role="alert">
        <p>{{ t('adjust.unavailable') }}</p>
        <p>
          <RouterLink class="button" :to="{ name: 'settings', params: { topicId } }">
            {{ t('adjust.toSettings') }}
          </RouterLink>
        </p>
      </div>
      <OnboardingChat
        v-else-if="context && assistant?.available"
        v-model:session-id="sessionId"
        :workspace-id="topic!.workspace_id"
        :context="context"
        @proposal="onProposal"
        @next="toCompare"
        @unavailable="unavailable = true"
      />
    </template>

    <form v-else class="compare" novalidate @submit.prevent="apply">
      <h1 tabindex="-1">{{ t('adjust.compareTitle') }}</h1>
      <template v-if="changes.length">
        <p class="lead">{{ t('adjust.compareIntro') }}</p>
        <fieldset v-for="change in changes" :key="change.field" class="change">
          <legend>{{ label(change.field) }}</legend>
          <div class="sides">
            <div class="side">
              <p class="side-title">{{ t('adjust.before') }}</p>
              <p class="value" :data-empty="!change.before || undefined">
                {{
                  change.field === 'output_langs'
                    ? langNames(change.before)
                    : change.before || t('adjust.empty')
                }}
              </p>
            </div>
            <div class="side">
              <label
                v-if="change.field !== 'output_langs'"
                :for="`${id}-${change.field}`"
                class="side-title"
                >{{ t('adjust.after') }}</label
              >
              <p v-else class="side-title">{{ t('adjust.after') }}</p>
              <p v-if="change.field === 'output_langs'" class="value">
                {{ langNames(change.after) }}
              </p>
              <textarea
                v-else
                :id="`${id}-${change.field}`"
                v-model="change.after"
                class="field"
                rows="4"
                maxlength="4000"
              ></textarea>
            </div>
          </div>
          <label class="keep">
            <input v-model="change.apply" type="checkbox" />
            <span>{{ t('adjust.keep') }}</span>
          </label>
        </fieldset>
        <div class="actions">
          <button
            type="submit"
            class="button"
            data-variant="primary"
            :disabled="applying || !changes.some((c) => c.apply)"
          >
            {{
              applying
                ? t('adjust.applying')
                : t('adjust.apply', changes.filter((c) => c.apply).length)
            }}
          </button>
          <button type="button" class="button" @click="router.push({ query: {} })">
            {{ t('adjust.backToChat') }}
          </button>
          <button type="button" class="button" @click="restart">{{ t('adjust.restart') }}</button>
        </div>
        <p
          v-if="applyError"
          :id="`${id}-apply-error`"
          class="notice notice-inline"
          data-tone="danger"
          role="alert"
          tabindex="-1"
        >
          <Icon name="alert-circle" />
          <span>{{ applyError }}</span>
        </p>
      </template>
      <template v-else>
        <p>{{ t('adjust.noChange') }}</p>
        <div class="actions">
          <button type="button" class="button" @click="router.push({ query: {} })">
            {{ t('adjust.backToChat') }}
          </button>
          <button type="button" class="button" @click="quit">{{ t('adjust.quit') }}</button>
        </div>
      </template>
    </form>
  </FullScreen>
</template>

<style scoped>
.lead {
  margin: 0;
}

/* The intro reads with the title: only the title's own margin between them, not the
 * column's gap as well. */
h1 + .lead {
  margin-top: calc(-1 * var(--space-6));
}

.notice {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.notice p {
  margin: 0;
}

.compare {
  display: grid;
  gap: var(--space-5);
}

.compare h1 {
  margin: 0;
}

.change {
  display: grid;
  gap: var(--space-4);
}

.sides {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
  gap: var(--space-4);
}

.side {
  display: grid;
  align-content: start;
  gap: var(--space-2);
}

.side-title {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-weight: 650;
}

.value {
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius);
  background: var(--color-surface-2);
  white-space: pre-line;
}

.value[data-empty] {
  color: var(--color-text-muted);
  font-style: italic;
}

.field {
  width: 100%;
  resize: vertical;
}

.keep {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 2.75rem;
  font-weight: 600;
}

.keep input {
  width: 1.25rem;
  height: 1.25rem;
  accent-color: var(--color-accent-text);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
</style>
