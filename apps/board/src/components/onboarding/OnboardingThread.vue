<script setup lang="ts">
/**
 * The creation conversation. A script, not a free chat: each question is a real form
 * (a fieldset or a labelled field whose legend or label is the assistant's bubble), its
 * answer then shows as the person's bubble, with Change to come back to it. Only what
 * defines the topic goes to the AI assistant; without it, those are open questions.
 * The focus always goes to the next question; nothing is saved before the summary.
 */
import { computed, nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import ContentLangsPicker from '../ContentLangsPicker.vue'
import OnboardingChat from '../OnboardingChat.vue'
import ChoiceList from './ChoiceList.vue'
import type { OnboardingContext, OnboardingSession } from '../../lib/api'
import { contentLangName } from '../../lib/langs'
import {
  applyProposal,
  injectOnboardingDraft,
  LISTEN_PLATFORMS,
  parseSlots,
  publishChoices,
  PUBLISH_CHANNELS,
  PUBLISH_EXTRAS,
  setPublishChoices,
  setToolChoices,
  siteUrl,
  threadSteps,
  toolChoices,
  TOOLS,
  type PublishChoice,
  type ThreadStep,
} from '../../lib/onboarding'

const props = defineProps<{ workspaceId: string; withAssistant: boolean }>()
const emit = defineEmits<{ review: [] }>()

const { t, locale } = useI18n()
const id = useId()
const draft = injectOnboardingDraft()

const steps = computed(() => threadSteps(draft, props.withAssistant))
const current = computed(() => steps.value.find((s) => !draft.answered.includes(s)))
/** Asked so far: answered questions up to the current one (later answers wait). */
const visible = computed(() => {
  const index = current.value ? steps.value.indexOf(current.value) : steps.value.length - 1
  return steps.value.slice(0, index + 1)
})
const editing = ref<ThreadStep | null>(null)
const error = ref<{ step: ThreadStep; message: string } | null>(null)
const errorFor = (step: ThreadStep) => (error.value?.step === step ? error.value.message : '')
const formId = (step: ThreadStep) => `${id}-${step}`

// Options of the closed questions ---------------------------------------------------------
const toolOptions = computed(() =>
  TOOLS.map((tool) => ({
    value: tool,
    label: t(`onboarding.goal.${tool}`),
    hint: t(`onboarding.goal.${tool}Hint`),
  })),
)
const publishOptions = computed(() =>
  [...PUBLISH_CHANNELS, ...PUBLISH_EXTRAS].map((value) => ({
    value: value as PublishChoice,
    label: (PUBLISH_CHANNELS as readonly string[]).includes(value)
      ? t(`onboarding.networks.channels.${value}`)
      : t(`onboarding.networks.${value}`),
  })),
)
const listenOptions = computed(() =>
  LISTEN_PLATFORMS.map((value) => ({
    value,
    label: t(`onboarding.networks.platforms.${value}`),
  })),
)
const tools = computed({ get: () => toolChoices(draft), set: (v) => setToolChoices(draft, v) })
const publish = computed({
  get: () => publishChoices(draft),
  set: (v) => setPublishChoices(draft, v),
})
const mentionsX = computed(() => /^\s*(x|twitter)(\.com)?\s*$/i.test(draft.otherNetworkName))

// What the assistant knows already: never asked again.
const context = computed<OnboardingContext>(() => ({
  name: draft.name.trim(),
  url: draft.url.trim() ? siteUrl(draft.url) : undefined,
  tools: [
    ...(draft.curation ? (['curation'] as const) : []),
    ...(draft.composeInterest ? (['compose'] as const) : []),
    ...(draft.engagement ? (['engagement'] as const) : []),
  ],
  channels: draft.curation || draft.composeInterest ? draft.channels : [],
  listen: draft.engagement ? draft.listen : [],
  newsletter: draft.curation && draft.newsletter,
  ui_lang: locale.value === 'en' ? 'en' : 'fr',
}))

// Answers as the person's bubble ----------------------------------------------------------
const list = (items: string[]) =>
  items.length ? new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(items) : ''
function summary(step: ThreadStep): string {
  switch (step) {
    case 'name':
      return draft.name.trim()
    case 'url':
      return draft.url.trim() || t('onboarding.thread.noSite')
    case 'tools':
      return list(toolChoices(draft).map((tool) => t(`onboarding.goal.${tool}`)))
    case 'publish': {
      const labels = publishChoices(draft).map((value) =>
        value === 'other'
          ? draft.otherNetworkName.trim()
          : (publishOptions.value.find((o) => o.value === value)?.label ?? value),
      )
      return list(labels) || t('onboarding.thread.noneYet')
    }
    case 'listen':
      return (
        list(draft.listen.map((p) => t(`onboarding.networks.platforms.${p}`))) ||
        t('onboarding.thread.noneYet')
      )
    case 'assistant':
      return ''
    case 'description':
      return draft.description.trim() || t('onboarding.thread.skipped')
    case 'audience':
      return draft.audience.trim() || t('onboarding.thread.skipped')
    case 'voice':
      return draft.styleRules.trim() || t('onboarding.thread.skipped')
    case 'langs':
      return list(draft.langs.map((lang) => contentLangName(lang)))
    case 'rhythm':
      return t(
        'onboarding.thread.rhythmSummary',
        { slots: list(parseSlots(draft.slots) ?? []) },
        draft.postsPerDay,
      )
    case 'budget':
      return t('onboarding.thread.budgetSummary', { amount: draft.budget })
  }
}

// Answering -------------------------------------------------------------------------------
function validate(step: ThreadStep): string {
  switch (step) {
    case 'name':
      return draft.name.trim() ? '' : t('onboarding.errors.name')
    case 'url':
      if (!draft.url.trim()) return ''
      try {
        new URL(siteUrl(draft.url))
        return ''
      } catch {
        return t('onboarding.errors.url')
      }
    case 'tools':
      return draft.curation || draft.engagement || draft.composeInterest
        ? ''
        : t('onboarding.errors.tools')
    case 'publish':
      return draft.otherNetwork && !draft.otherNetworkName.trim()
        ? t('onboarding.errors.otherNetwork')
        : ''
    case 'langs':
      return draft.langs.length ? '' : t('newTopic.langsRequired')
    case 'rhythm':
      return parseSlots(draft.slots) ? '' : t('settings.slotsInvalid')
    case 'budget':
      return typeof draft.budget === 'number' && draft.budget >= 0
        ? ''
        : t('onboarding.errors.budget')
    default:
      return ''
  }
}

async function focusIn(selector: string) {
  await nextTick()
  document.querySelector<HTMLElement>(selector)?.focus()
}

async function answer(step: ThreadStep) {
  const message = validate(step)
  if (message) {
    error.value = { step, message }
    return focusIn(`#${formId(step)} [aria-invalid="true"], #${formId(step)} input`)
  }
  error.value = null
  if (!draft.answered.includes(step)) draft.answered = [...draft.answered, step]
  const wasEditing = editing.value === step
  editing.value = null
  if (wasEditing) return focusIn(`#${id}-change-${step}`)
  await next()
}

/** Skip: the question is answered by leaving its value empty. */
function skip(step: ThreadStep, clear: () => void) {
  clear()
  void answer(step)
}

async function next() {
  const step = current.value
  if (!step) return focusIn(`#${id}-review`)
  if (step === 'assistant') return // the assistant's field takes the focus itself
  await focusIn(`#${formId(step)} input, #${formId(step)} textarea, #${formId(step)} select`)
}

function change(step: ThreadStep) {
  editing.value = step
  error.value = null
  void focusIn(`#${formId(step)} input, #${formId(step)} textarea, #${formId(step)} select`)
}

function cancelChange(step: ThreadStep) {
  editing.value = null
  error.value = null
  void focusIn(`#${id}-change-${step}`)
}

function assistantDone() {
  if (!draft.answered.includes('assistant')) draft.answered = [...draft.answered, 'assistant']
  void next()
}
function assistantUnavailable() {
  draft.assistantOff = true
  void next()
}
function onProposal(session: OnboardingSession) {
  applyProposal(draft, session.proposal)
}

const open = (step: ThreadStep) => step === current.value || step === editing.value
</script>

<template>
  <ol class="thread" :aria-label="t('onboarding.thread.label')">
    <li>
      <p class="bubble" data-from="assistant">
        <span class="who">
          {{ t('onboarding.chat.assistant')
          }}<span class="visually-hidden">{{ t('onboarding.chat.separator') }}</span>
        </span>
        <span class="text">{{ t('onboarding.thread.welcome') }}</span>
      </p>
    </li>

    <li v-for="step in visible" :key="step" class="turn">
      <!-- The assistant's part: its own exchange, read-only once the person moved on. -->
      <template v-if="step === 'assistant'">
        <p class="bubble" data-from="assistant">
          <span class="text">{{ t('onboarding.thread.q.assistant') }}</span>
        </p>
        <OnboardingChat
          v-model:session-id="draft.sessionId"
          :workspace-id="workspaceId"
          :context="context"
          :active="current === 'assistant'"
          @proposal="onProposal"
          @next="assistantDone"
          @unavailable="assistantUnavailable"
        />
      </template>

      <!-- An open question: a form whose legend or label is the question itself. -->
      <form
        v-else-if="open(step)"
        :id="formId(step)"
        class="ask"
        novalidate
        @submit.prevent="answer(step)"
      >
        <template v-if="step === 'name' || step === 'url' || step === 'budget'">
          <label :for="`${formId(step)}-field`" class="bubble" data-from="assistant">
            <span class="text">{{ t(`onboarding.thread.q.${step}`) }}</span>
          </label>
          <div class="compose">
            <input
              v-if="step === 'name'"
              :id="`${formId(step)}-field`"
              v-model="draft.name"
              class="field"
              type="text"
              maxlength="100"
              autocomplete="off"
              :aria-invalid="!!errorFor(step) || undefined"
              :aria-describedby="`${formId(step)}-hint${errorFor(step) ? ` ${formId(step)}-error` : ''}`"
            />
            <input
              v-else-if="step === 'url'"
              :id="`${formId(step)}-field`"
              v-model="draft.url"
              class="field"
              type="url"
              inputmode="url"
              autocomplete="url"
              placeholder="https://"
              :aria-invalid="!!errorFor(step) || undefined"
              :aria-describedby="`${formId(step)}-hint${errorFor(step) ? ` ${formId(step)}-error` : ''}`"
            />
            <input
              v-else
              :id="`${formId(step)}-field`"
              v-model.number="draft.budget"
              class="field small"
              type="number"
              min="0"
              max="10000"
              step="1"
              :aria-invalid="!!errorFor(step) || undefined"
              :aria-describedby="`${formId(step)}-hint${errorFor(step) ? ` ${formId(step)}-error` : ''}`"
            />
            <p :id="`${formId(step)}-hint`" class="hint">
              {{ t(`onboarding.thread.hint.${step}`) }}
            </p>
            <p v-if="errorFor(step)" :id="`${formId(step)}-error`" class="error" role="alert">
              {{ errorFor(step) }}
            </p>
            <div class="actions">
              <button type="submit" class="button" data-variant="primary">
                {{ t('onboarding.thread.ok') }}
              </button>
              <button
                v-if="step === 'url'"
                type="button"
                class="button"
                @click="skip(step, () => (draft.url = ''))"
              >
                {{ t('onboarding.thread.noSite') }}
              </button>
              <button
                v-if="editing === step"
                type="button"
                class="button"
                @click="cancelChange(step)"
              >
                {{ t('common.cancel') }}
              </button>
            </div>
          </div>
        </template>

        <template v-else-if="step === 'description' || step === 'audience' || step === 'voice'">
          <label :for="`${formId(step)}-field`" class="bubble" data-from="assistant">
            <span class="text">{{ t(`onboarding.thread.q.${step}`) }}</span>
          </label>
          <div class="compose">
            <textarea
              v-if="step === 'description'"
              :id="`${formId(step)}-field`"
              v-model="draft.description"
              class="field"
              rows="3"
              maxlength="2000"
              :aria-describedby="`${formId(step)}-hint`"
            ></textarea>
            <textarea
              v-else-if="step === 'audience'"
              :id="`${formId(step)}-field`"
              v-model="draft.audience"
              class="field"
              rows="3"
              maxlength="2000"
              :aria-describedby="`${formId(step)}-hint`"
            ></textarea>
            <textarea
              v-else
              :id="`${formId(step)}-field`"
              v-model="draft.styleRules"
              class="field"
              rows="3"
              maxlength="4000"
              :aria-describedby="`${formId(step)}-hint`"
            ></textarea>
            <p :id="`${formId(step)}-hint`" class="hint">
              {{ t(`onboarding.thread.hint.${step}`) }}
            </p>
            <div class="actions">
              <button type="submit" class="button" data-variant="primary">
                {{ t('onboarding.thread.ok') }}
              </button>
              <button
                v-if="editing !== step"
                type="button"
                class="button"
                @click="
                  skip(step, () => {
                    if (step === 'description') draft.description = ''
                    else if (step === 'audience') draft.audience = ''
                    else draft.styleRules = ''
                  })
                "
              >
                {{ t('onboarding.thread.skip') }}
              </button>
              <button v-else type="button" class="button" @click="cancelChange(step)">
                {{ t('common.cancel') }}
              </button>
            </div>
          </div>
        </template>

        <template v-else-if="step === 'tools' || step === 'publish' || step === 'listen'">
          <ChoiceList
            v-if="step === 'tools'"
            v-model="tools"
            legend-class="bubble legend"
            body-class="compose"
            :legend="t('onboarding.thread.q.tools')"
            :options="toolOptions"
            :hint="t('onboarding.goal.toolsHint')"
            :error="errorFor(step)"
          >
            <template #after>
              <div class="actions">
                <button type="submit" class="button" data-variant="primary">
                  {{ t('onboarding.thread.ok') }}
                </button>
                <button
                  v-if="editing === step"
                  type="button"
                  class="button"
                  @click="cancelChange(step)"
                >
                  {{ t('common.cancel') }}
                </button>
              </div>
            </template>
          </ChoiceList>
          <ChoiceList
            v-else-if="step === 'publish'"
            v-model="publish"
            legend-class="bubble legend"
            body-class="compose"
            :legend="t('onboarding.thread.q.publish')"
            :options="publishOptions"
            :error="errorFor(step)"
          >
            <div v-if="draft.otherNetwork" class="form-row other">
              <label :for="`${formId(step)}-other`">{{ t('onboarding.networks.otherName') }}</label>
              <input
                :id="`${formId(step)}-other`"
                v-model="draft.otherNetworkName"
                class="field"
                type="text"
                maxlength="60"
                :aria-invalid="!!errorFor(step) || undefined"
                :aria-describedby="`${formId(step)}-other-hint`"
              />
              <p :id="`${formId(step)}-other-hint`" class="hint">
                {{ mentionsX ? t('onboarding.networks.noX') : t('onboarding.networks.otherHint') }}
              </p>
            </div>
            <template #after>
              <div class="actions">
                <button type="submit" class="button" data-variant="primary">
                  {{ t('onboarding.thread.ok') }}
                </button>
                <button
                  v-if="editing !== step"
                  type="button"
                  class="button"
                  @click="skip(step, () => setPublishChoices(draft, []))"
                >
                  {{ t('onboarding.thread.later') }}
                </button>
                <button v-else type="button" class="button" @click="cancelChange(step)">
                  {{ t('common.cancel') }}
                </button>
              </div>
            </template>
          </ChoiceList>
          <ChoiceList
            v-else
            v-model="draft.listen"
            legend-class="bubble legend"
            body-class="compose"
            :legend="t('onboarding.thread.q.listen')"
            :options="listenOptions"
            :hint="t('onboarding.networks.listenHint')"
          >
            <template #after>
              <div class="actions">
                <button type="submit" class="button" data-variant="primary">
                  {{ t('onboarding.thread.ok') }}
                </button>
                <button
                  v-if="editing !== step"
                  type="button"
                  class="button"
                  @click="skip(step, () => (draft.listen = []))"
                >
                  {{ t('onboarding.thread.later') }}
                </button>
                <button v-else type="button" class="button" @click="cancelChange(step)">
                  {{ t('common.cancel') }}
                </button>
              </div>
            </template>
          </ChoiceList>
        </template>

        <template v-else-if="step === 'langs'">
          <p class="bubble" data-from="assistant">
            <span class="text">{{ t('onboarding.thread.q.langs') }}</span>
          </p>
          <div class="compose">
            <ContentLangsPicker
              v-model="draft.langs"
              :legend="t('newTopic.langs')"
              :hint="
                draft.proposed.includes('langs')
                  ? t('onboarding.thread.hint.langsProposed')
                  : t('newTopic.langsHint')
              "
            />
            <p v-if="errorFor(step)" class="error" role="alert">{{ errorFor(step) }}</p>
            <div class="actions">
              <button type="submit" class="button" data-variant="primary">
                {{ t('onboarding.thread.ok') }}
              </button>
              <button
                v-if="editing === step"
                type="button"
                class="button"
                @click="cancelChange(step)"
              >
                {{ t('common.cancel') }}
              </button>
            </div>
          </div>
        </template>

        <template v-else-if="step === 'rhythm'">
          <fieldset class="rhythm">
            <legend class="bubble legend">{{ t('onboarding.thread.q.rhythm') }}</legend>
            <div class="compose">
              <div class="pair">
                <div class="form-row">
                  <label :for="`${formId(step)}-per-day`">{{ t('settings.postsPerDay') }}</label>
                  <input
                    :id="`${formId(step)}-per-day`"
                    v-model.number="draft.postsPerDay"
                    class="field small"
                    type="number"
                    min="0"
                    max="10"
                    step="1"
                  />
                </div>
                <div class="form-row">
                  <label :for="`${formId(step)}-slots`">{{ t('settings.slots') }}</label>
                  <input
                    :id="`${formId(step)}-slots`"
                    v-model="draft.slots"
                    class="field"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    :aria-invalid="!!errorFor(step) || undefined"
                    :aria-describedby="`${formId(step)}-slots-hint${errorFor(step) ? ` ${formId(step)}-error` : ''}`"
                  />
                  <p :id="`${formId(step)}-slots-hint`" class="hint">
                    {{ t('settings.slotsHint') }}
                  </p>
                </div>
              </div>
              <p v-if="errorFor(step)" :id="`${formId(step)}-error`" class="error" role="alert">
                {{ errorFor(step) }}
              </p>
              <div class="actions">
                <button type="submit" class="button" data-variant="primary">
                  {{ t('onboarding.thread.ok') }}
                </button>
                <button
                  v-if="editing === step"
                  type="button"
                  class="button"
                  @click="cancelChange(step)"
                >
                  {{ t('common.cancel') }}
                </button>
              </div>
            </div>
          </fieldset>
        </template>
      </form>

      <!-- Answered: the question, then the person's answer, which can be changed. -->
      <template v-else>
        <p class="bubble" data-from="assistant">
          <span class="text">{{ t(`onboarding.thread.q.${step}`) }}</span>
        </p>
        <div class="bubble answer" data-from="you">
          <span class="who">
            {{ t('onboarding.chat.you')
            }}<span class="visually-hidden">{{ t('onboarding.chat.separator') }}</span>
          </span>
          <span class="text">{{ summary(step) }}</span>
          <button
            :id="`${id}-change-${step}`"
            type="button"
            class="button"
            :aria-label="
              t('onboarding.thread.changeLabel', { question: t(`onboarding.thread.q.${step}`) })
            "
            @click="change(step)"
          >
            {{ t('onboarding.thread.change') }}
          </button>
        </div>
      </template>
    </li>

    <li v-if="!current" class="turn">
      <p class="bubble" data-from="assistant">
        <span class="text">{{ t('onboarding.thread.end') }}</span>
      </p>
      <div class="end">
        <button
          :id="`${id}-review`"
          type="button"
          class="button"
          data-variant="primary"
          @click="emit('review')"
        >
          {{ t('onboarding.thread.toReview') }}
        </button>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.thread {
  display: grid;
  gap: var(--space-5);
  margin: 0;
  padding: 0;
  list-style: none;
}

.turn,
.ask {
  display: grid;
  gap: var(--space-3);
}

/* A focused field never hides under the bottom of the screen. */
.ask :is(input, textarea) {
  scroll-margin-bottom: 8rem;
}

.ask :deep(.legend),
.rhythm .legend {
  float: none;
  margin-bottom: var(--space-3);
}

.rhythm {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

/* Change: present on every answer, so kept quiet (still a 36px target). */
.answer .button {
  justify-self: end;
  min-height: 2.25rem;
  padding-block: var(--space-1);
  font-size: 0.875rem;
}

.other {
  padding-left: calc(1.25rem + var(--space-3));
}

.field {
  width: 100%;
}

.small {
  max-width: 8rem;
}

textarea.field {
  resize: vertical;
}

.pair {
  display: grid;
  align-items: start;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--space-4);
}

.actions,
.end {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.end {
  justify-content: flex-end;
}
</style>
