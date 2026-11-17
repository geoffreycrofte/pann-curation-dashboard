<script setup lang="ts">
/**
 * Creating a topic, in steps: what the person wants to do, where they publish or listen,
 * a few questions from the assistant (when Pann's assistant is available for this
 * workspace), then a review of every setting before anything is saved. The step lives in the address
 * (?step=…) so that Back and reload work. Nothing is written before "Create the topic".
 */
import { useQuery, useQueryCache } from '@pinia/colada'
import { computed, nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import ContentLangsPicker from '../components/ContentLangsPicker.vue'
import OnboardingChat from '../components/OnboardingChat.vue'
import { api, type OnboardingContext, type OnboardingSession } from '../lib/api'
import { describeError } from '../lib/errors'
import {
  applyProposal,
  draftConfig,
  LISTEN_PLATFORMS,
  parseSlots,
  PUBLISH_CHANNELS,
  siteUrl,
  useOnboardingDraft,
  type ProposedField,
} from '../lib/onboarding'
import { useWorkspace } from '../lib/workspace'

const { t, locale } = useI18n()
const id = useId()
const route = useRoute()
const router = useRouter()
const queryCache = useQueryCache()
const { workspaceId } = useWorkspace()
const { draft, clear } = useOnboardingDraft()

const ALL_STEPS = ['goal', 'networks', 'chat', 'review'] as const
type Step = (typeof ALL_STEPS)[number]
// The questions step exists only when Pann's assistant can run for this workspace (key
// set, onboarding credit and monthly cap not reached); otherwise the review comes next.
const { data: assistant } = useQuery({
  key: () => ['onboarding-available', workspaceId.value ?? ''],
  query: () => api.onboardingAvailable(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})
const withChat = computed(() => assistant.value?.available === true || !!draft.sessionId)
const STEPS = computed<readonly Step[]>(() =>
  withChat.value ? ALL_STEPS : ALL_STEPS.filter((s) => s !== 'chat'),
)
const step = computed<Step>(() => {
  const value = route.query.step
  const wanted = (STEPS.value as readonly unknown[]).includes(value)
    ? (value as Step)
    : value === 'chat'
      ? 'review'
      : 'goal'
  // A later step needs the goal: back to it until a name and a tool are chosen.
  return wanted !== 'goal' && !goalComplete.value ? 'goal' : wanted
})
const stepIndex = computed(() => STEPS.value.indexOf(step.value))
const goalComplete = computed(() => !!draft.name.trim() && (draft.curation || draft.engagement))
/** Publishing is asked when a tool publishes; listening when conversations are on. */
const asksPublish = computed(() => draft.curation)
const asksListen = computed(() => draft.engagement)

async function go(next: Step) {
  await router.push({ query: { step: next === 'goal' ? undefined : next } })
}

// Step 1: goal --------------------------------------------------------------------------
const goalError = ref<'' | 'name' | 'tools'>('')
const nameInput = ref<HTMLInputElement>()
const firstTool = ref<HTMLInputElement>()
async function submitGoal() {
  goalError.value = !draft.name.trim()
    ? 'name'
    : !(draft.curation || draft.engagement)
      ? 'tools'
      : ''
  if (goalError.value) {
    await nextTick()
    ;(goalError.value === 'name' ? nameInput : firstTool).value?.focus()
    return
  }
  await go('networks')
}

// Step 2: networks ----------------------------------------------------------------------
const otherNameError = ref(false)
const otherInput = ref<HTMLInputElement>()
const mentionsX = computed(() => /^\s*(x|twitter)(\.com)?\s*$/i.test(draft.otherNetworkName))
async function submitNetworks(skip = false) {
  if (skip) {
    draft.channels = []
    draft.newsletter = false
    draft.feed = false
    draft.otherNetwork = false
    draft.listen = []
  }
  otherNameError.value = draft.otherNetwork && !draft.otherNetworkName.trim()
  if (otherNameError.value) {
    await nextTick()
    otherInput.value?.focus()
    return
  }
  await go(withChat.value ? 'chat' : 'review')
}

// Step 3: questions ---------------------------------------------------------------------
const chatContext = computed<OnboardingContext>(() => ({
  name: draft.name.trim(),
  url: draft.url.trim() ? siteUrl(draft.url) : undefined,
  tools: [
    ...(draft.curation ? (['curation'] as const) : []),
    ...(draft.engagement ? (['engagement'] as const) : []),
  ],
  channels: draft.curation ? draft.channels : [],
  listen: draft.engagement ? draft.listen : [],
  newsletter: draft.curation && draft.newsletter,
  ui_lang: locale.value === 'en' ? 'en' : 'fr',
}))
function onProposal(session: OnboardingSession) {
  applyProposal(draft, session.proposal)
}
/** An edited field is no longer the assistant's proposal. */
function edited(field: ProposedField) {
  if (draft.proposed.includes(field)) draft.proposed = draft.proposed.filter((f) => f !== field)
}
const isProposed = (field: ProposedField) => draft.proposed.includes(field)

// Step 4: review and creation -----------------------------------------------------------
const errors = ref<{ field: string; message: string }[]>([])
const errorSummary = ref<HTMLElement>()
const creating = ref(false)
const createError = ref('')

function validate() {
  const list: { field: string; message: string }[] = []
  if (!draft.name.trim()) list.push({ field: `${id}-name`, message: t('onboarding.errors.name') })
  if (!draft.langs.length) list.push({ field: `${id}-langs`, message: t('newTopic.langsRequired') })
  if (draft.curation && !parseSlots(draft.slots))
    list.push({ field: `${id}-slots`, message: t('settings.slotsInvalid') })
  if (draft.url.trim()) {
    try {
      new URL(siteUrl(draft.url))
    } catch {
      list.push({ field: `${id}-url`, message: t('onboarding.errors.url') })
    }
  }
  return list
}
const errorFor = (field: string) => errors.value.find((e) => e.field === field)?.message

async function create() {
  errors.value = validate()
  if (errors.value.length) {
    await nextTick()
    errorSummary.value?.focus()
    return
  }
  creating.value = true
  createError.value = ''
  try {
    const requests = [
      ...(draft.otherNetwork && draft.otherNetworkName.trim()
        ? [{ kind: 'network' as const, subject: draft.otherNetworkName.trim().slice(0, 60) }]
        : []),
      ...(draft.composeInterest ? [{ kind: 'feature' as const, subject: 'compose' }] : []),
    ]
    const topic = await api.createTopic({
      workspace_id: workspaceId.value!,
      name_fr: draft.name.trim(),
      name_en: draft.nameEn.trim() || undefined,
      monthly_budget_usd: draft.budget,
      config: draftConfig(draft),
      requests,
    })
    // What the person ticked that is set up apart from the config: a public feed, and
    // the first conversation searches (the name of what they promote).
    if (draft.feed) await api.setFeed(topic.id, true).catch(() => undefined)
    for (const platform of draft.engagement ? draft.listen : []) {
      await api
        .addSearchSource(topic.id, {
          type: platform,
          label: draft.name.trim(),
          config: { query: draft.name.trim() },
          default_kind: null,
          interval_hours: null,
        })
        .catch(() => undefined)
    }
    clear()
    await queryCache.invalidateQueries({ key: ['topics'] })
    await router.push({ name: 'overview', params: { topicId: topic.id }, query: { new: '1' } })
  } catch (err) {
    createError.value = describeError((err as Error).message, t).text
  } finally {
    creating.value = false
  }
}

function restart() {
  clear()
  void go('goal')
}
</script>

<template>
  <div class="onboarding">
    <ol class="steps" :aria-label="t('onboarding.stepsLabel')">
      <li
        v-for="(name, index) in STEPS"
        :key="name"
        :aria-current="index === stepIndex ? 'step' : undefined"
        :data-done="index < stepIndex || undefined"
      >
        <span class="visually-hidden">{{
          t('onboarding.stepOf', { index: index + 1, count: STEPS.length })
        }}</span>
        {{ t(`onboarding.steps.${name}`) }}
      </li>
    </ol>

    <!-- 1. Goal -->
    <form v-if="step === 'goal'" class="form step" novalidate @submit.prevent="submitGoal">
      <h1 tabindex="-1">{{ t('onboarding.goal.title') }}</h1>
      <div class="form-row">
        <label :for="`${id}-name`">{{ t('onboarding.goal.name') }}</label>
        <input
          :id="`${id}-name`"
          ref="nameInput"
          v-model="draft.name"
          class="field"
          type="text"
          maxlength="100"
          required
          :aria-invalid="goalError === 'name' || undefined"
          :aria-describedby="`${id}-name-hint${goalError === 'name' ? ` ${id}-name-error` : ''}`"
        />
        <p :id="`${id}-name-hint`" class="hint">{{ t('onboarding.goal.nameHint') }}</p>
        <p v-if="goalError === 'name'" :id="`${id}-name-error`" class="error" role="alert">
          {{ t('onboarding.errors.name') }}
        </p>
      </div>
      <div class="form-row">
        <label :for="`${id}-url`">
          {{ t('onboarding.goal.url') }} ({{ t('common.optional') }})
        </label>
        <input
          :id="`${id}-url`"
          v-model="draft.url"
          class="field"
          type="url"
          inputmode="url"
          autocomplete="url"
          placeholder="https://"
        />
      </div>

      <fieldset
        class="choices"
        :aria-invalid="goalError === 'tools' || undefined"
        :aria-describedby="`${id}-tools-hint${goalError === 'tools' ? ` ${id}-tools-error` : ''}`"
      >
        <legend>{{ t('onboarding.goal.tools') }}</legend>
        <p :id="`${id}-tools-hint`" class="hint">{{ t('onboarding.goal.toolsHint') }}</p>
        <label class="choice">
          <input ref="firstTool" v-model="draft.curation" type="checkbox" />
          <span>
            <strong>{{ t('onboarding.goal.curation') }}</strong>
            <span class="hint">{{ t('onboarding.goal.curationHint') }}</span>
          </span>
        </label>
        <label class="choice">
          <input v-model="draft.engagement" type="checkbox" />
          <span>
            <strong>{{ t('onboarding.goal.engagement') }}</strong>
            <span class="hint">{{ t('onboarding.goal.engagementHint') }}</span>
          </span>
        </label>
        <label class="choice">
          <input v-model="draft.composeInterest" type="checkbox" />
          <span>
            <strong>{{ t('onboarding.goal.compose') }}</strong>
            <span class="hint">{{ t('onboarding.goal.composeHint') }}</span>
          </span>
        </label>
        <p v-if="goalError === 'tools'" :id="`${id}-tools-error`" class="error" role="alert">
          {{ t('onboarding.errors.tools') }}
        </p>
      </fieldset>
      <div class="actions">
        <button type="submit" class="button" data-variant="primary">
          {{ t('onboarding.continue') }}
        </button>
      </div>
    </form>

    <!-- 2. Networks -->
    <form
      v-else-if="step === 'networks'"
      class="form step"
      novalidate
      @submit.prevent="submitNetworks()"
    >
      <h1 tabindex="-1">
        {{ asksPublish ? t('onboarding.networks.title') : t('onboarding.networks.listenTitle') }}
      </h1>
      <fieldset v-if="asksPublish" class="choices">
        <legend>{{ t('onboarding.networks.publish') }}</legend>
        <label v-for="channel in PUBLISH_CHANNELS" :key="channel" class="choice">
          <input v-model="draft.channels" type="checkbox" :value="channel" />
          <span>{{ t(`onboarding.networks.channels.${channel}`) }}</span>
        </label>
        <p class="subhead">{{ t('onboarding.networks.beyond') }}</p>
        <label class="choice">
          <input v-model="draft.newsletter" type="checkbox" />
          <span>{{ t('onboarding.networks.newsletter') }}</span>
        </label>
        <label class="choice">
          <input v-model="draft.feed" type="checkbox" />
          <span>{{ t('onboarding.networks.feed') }}</span>
        </label>
        <label class="choice">
          <input v-model="draft.otherNetwork" type="checkbox" />
          <span>{{ t('onboarding.networks.other') }}</span>
        </label>
        <div v-if="draft.otherNetwork" class="form-row other">
          <label :for="`${id}-other`">{{ t('onboarding.networks.otherName') }}</label>
          <input
            :id="`${id}-other`"
            ref="otherInput"
            v-model="draft.otherNetworkName"
            class="field"
            type="text"
            maxlength="60"
            :aria-invalid="otherNameError || undefined"
            :aria-describedby="`${id}-other-hint${otherNameError ? ` ${id}-other-error` : ''}`"
          />
          <p :id="`${id}-other-hint`" class="hint">
            {{ mentionsX ? t('onboarding.networks.noX') : t('onboarding.networks.otherHint') }}
          </p>
          <p v-if="otherNameError" :id="`${id}-other-error`" class="error" role="alert">
            {{ t('onboarding.errors.otherNetwork') }}
          </p>
        </div>
      </fieldset>
      <fieldset v-if="asksListen" class="choices">
        <legend>{{ t('onboarding.networks.listen') }}</legend>
        <p class="hint">{{ t('onboarding.networks.listenHint') }}</p>
        <label v-for="platform in LISTEN_PLATFORMS" :key="platform" class="choice">
          <input v-model="draft.listen" type="checkbox" :value="platform" />
          <span>{{ t(`onboarding.networks.platforms.${platform}`) }}</span>
        </label>
      </fieldset>
      <div class="actions">
        <button type="button" class="button" @click="go('goal')">{{ t('onboarding.back') }}</button>
        <button type="submit" class="button" data-variant="primary">
          {{ t('onboarding.continue') }}
        </button>
        <button type="button" class="button" @click="submitNetworks(true)">
          {{ t('onboarding.skip') }}
        </button>
      </div>
    </form>

    <!-- 3. Questions -->
    <section v-else-if="step === 'chat'" class="step" :aria-labelledby="`${id}-chat-title`">
      <h1 :id="`${id}-chat-title`" tabindex="-1">{{ t('onboarding.chat.title') }}</h1>
      <p class="lead">{{ t('onboarding.chat.intro') }}</p>
      <OnboardingChat
        v-model:session-id="draft.sessionId"
        :workspace-id="workspaceId!"
        :context="chatContext"
        @proposal="onProposal"
        @next="go('review')"
      />
      <div class="actions">
        <button type="button" class="button" @click="go('networks')">
          {{ t('onboarding.back') }}
        </button>
      </div>
    </section>

    <!-- 4. Review -->
    <form v-else class="form step review" novalidate @submit.prevent="create">
      <h1 tabindex="-1">{{ t('onboarding.review.title') }}</h1>
      <p>{{ t('onboarding.review.intro') }}</p>

      <div v-if="errors.length" ref="errorSummary" class="error-summary" role="alert" tabindex="-1">
        <h2>{{ t('onboarding.review.errors', errors.length) }}</h2>
        <ul>
          <li v-for="error in errors" :key="error.field">
            <a :href="`#${error.field}`">{{ error.message }}</a>
          </li>
        </ul>
      </div>

      <section :aria-labelledby="`${id}-product`">
        <h2 :id="`${id}-product`">{{ t('onboarding.review.product') }}</h2>
        <div class="form-row">
          <label :for="`${id}-name`">{{ t('onboarding.goal.name') }}</label>
          <input
            :id="`${id}-name`"
            v-model="draft.name"
            class="field"
            type="text"
            maxlength="100"
            required
            :aria-invalid="!!errorFor(`${id}-name`) || undefined"
          />
        </div>
        <div class="form-row">
          <label :for="`${id}-name-en`">
            {{ t('onboarding.review.nameEn') }} ({{ t('common.optional') }})
            <span v-if="isProposed('nameEn')" class="proposed">{{
              t('onboarding.review.proposed')
            }}</span>
          </label>
          <input
            :id="`${id}-name-en`"
            v-model="draft.nameEn"
            @input="edited('nameEn')"
            class="field"
            type="text"
            maxlength="100"
            lang="en"
            :aria-describedby="`${id}-name-en-hint`"
          />
          <p :id="`${id}-name-en-hint`" class="hint">{{ t('onboarding.review.nameEnHint') }}</p>
        </div>
        <div class="form-row">
          <label :for="`${id}-url`">
            {{ t('onboarding.goal.url') }} ({{ t('common.optional') }})
          </label>
          <input
            :id="`${id}-url`"
            v-model="draft.url"
            class="field"
            type="url"
            inputmode="url"
            :aria-invalid="!!errorFor(`${id}-url`) || undefined"
          />
        </div>
        <div class="form-row">
          <label :for="`${id}-description`">
            {{ t('onboarding.review.description') }} ({{ t('common.optional') }})
            <span v-if="isProposed('description')" class="proposed">{{
              t('onboarding.review.proposed')
            }}</span>
          </label>
          <textarea
            :id="`${id}-description`"
            v-model="draft.description"
            @input="edited('description')"
            class="field"
            rows="3"
            maxlength="2000"
          ></textarea>
        </div>
        <div class="form-row">
          <label :for="`${id}-audience`">
            {{ t('onboarding.review.audience') }} ({{ t('common.optional') }})
            <span v-if="isProposed('audience')" class="proposed">{{
              t('onboarding.review.proposed')
            }}</span>
          </label>
          <textarea
            :id="`${id}-audience`"
            v-model="draft.audience"
            @input="edited('audience')"
            class="field"
            rows="2"
            maxlength="2000"
          ></textarea>
        </div>
        <div class="form-row">
          <label :for="`${id}-messages`">
            {{ t('onboarding.review.messages') }} ({{ t('common.optional') }})
            <span v-if="isProposed('messages')" class="proposed">{{
              t('onboarding.review.proposed')
            }}</span>
          </label>
          <textarea
            :id="`${id}-messages`"
            v-model="draft.messages"
            class="field"
            rows="3"
            maxlength="4000"
            @input="edited('messages')"
          ></textarea>
        </div>
        <div class="form-row">
          <label :for="`${id}-claims`">
            {{ t('onboarding.review.claimsToAvoid') }} ({{ t('common.optional') }})
            <span v-if="isProposed('claimsToAvoid')" class="proposed">{{
              t('onboarding.review.proposed')
            }}</span>
          </label>
          <textarea
            :id="`${id}-claims`"
            v-model="draft.claimsToAvoid"
            class="field"
            rows="2"
            maxlength="4000"
            @input="edited('claimsToAvoid')"
          ></textarea>
        </div>
      </section>

      <section :id="`${id}-langs`" tabindex="-1" :aria-labelledby="`${id}-langs-title`">
        <h2 :id="`${id}-langs-title`">
          {{ t('onboarding.review.langs') }}
          <span v-if="isProposed('langs')" class="proposed">{{
            t('onboarding.review.proposed')
          }}</span>
        </h2>
        <ContentLangsPicker
          v-model="draft.langs"
          @update:model-value="edited('langs')"
          :legend="t('newTopic.langs')"
          :hint="t('newTopic.langsHint')"
        />
      </section>

      <section v-if="draft.curation" :aria-labelledby="`${id}-matters`">
        <h2 :id="`${id}-matters`">{{ t('onboarding.review.matters') }}</h2>
        <div class="form-row">
          <label :for="`${id}-criteria`">
            {{ t('settings.criteria') }}
            <span v-if="isProposed('criteria')" class="proposed">{{
              t('onboarding.review.proposed')
            }}</span>
          </label>
          <textarea
            :id="`${id}-criteria`"
            v-model="draft.criteria"
            @input="edited('criteria')"
            class="field"
            rows="4"
            maxlength="4000"
            :aria-describedby="`${id}-criteria-hint`"
          ></textarea>
          <p :id="`${id}-criteria-hint`" class="hint">{{ t('newTopic.criteriaHint') }}</p>
        </div>
      </section>

      <section v-if="draft.engagement" :aria-labelledby="`${id}-conversations`">
        <h2 :id="`${id}-conversations`">{{ t('onboarding.review.conversations') }}</h2>
        <div class="form-row">
          <label :for="`${id}-engagement-criteria`">
            {{ t('engagement.settings.criteria') }}
            <span v-if="isProposed('engagementCriteria')" class="proposed">{{
              t('onboarding.review.proposed')
            }}</span>
          </label>
          <textarea
            :id="`${id}-engagement-criteria`"
            v-model="draft.engagementCriteria"
            @input="edited('engagementCriteria')"
            class="field"
            rows="3"
            maxlength="4000"
            :aria-describedby="`${id}-engagement-criteria-hint`"
          ></textarea>
          <p :id="`${id}-engagement-criteria-hint`" class="hint">
            {{ t('engagement.settings.criteriaHint') }}
          </p>
        </div>
      </section>

      <section :aria-labelledby="`${id}-voice`">
        <h2 :id="`${id}-voice`">{{ t('onboarding.review.voice') }}</h2>
        <div class="form-row">
          <label :for="`${id}-style`">
            {{ t('onboarding.review.style') }} ({{ t('common.optional') }})
            <span v-if="isProposed('styleRules')" class="proposed">{{
              t('onboarding.review.proposed')
            }}</span>
          </label>
          <textarea
            :id="`${id}-style`"
            v-model="draft.styleRules"
            @input="edited('styleRules')"
            class="field"
            rows="3"
            maxlength="4000"
            :aria-describedby="`${id}-style-hint`"
          ></textarea>
          <p :id="`${id}-style-hint`" class="hint">{{ t('onboarding.review.styleHint') }}</p>
        </div>
        <div v-if="draft.curation" class="form-row">
          <label :for="`${id}-post-rules`">
            {{ t('onboarding.review.postRules') }} ({{ t('common.optional') }})
            <span v-if="isProposed('postRules')" class="proposed">{{
              t('onboarding.review.proposed')
            }}</span>
          </label>
          <textarea
            :id="`${id}-post-rules`"
            v-model="draft.postRules"
            class="field"
            rows="2"
            maxlength="4000"
            :aria-describedby="`${id}-post-rules-hint`"
            @input="edited('postRules')"
          ></textarea>
          <p :id="`${id}-post-rules-hint`" class="hint">
            {{ t('onboarding.review.postRulesHint') }}
          </p>
        </div>
      </section>

      <section v-if="draft.curation" :aria-labelledby="`${id}-rhythm`">
        <h2 :id="`${id}-rhythm`">{{ t('onboarding.review.rhythm') }}</h2>
        <div class="pair">
          <div class="form-row">
            <label :for="`${id}-per-day`">
              {{ t('settings.postsPerDay') }}
              <span v-if="isProposed('postsPerDay')" class="proposed">{{
                t('onboarding.review.proposed')
              }}</span>
            </label>
            <input
              :id="`${id}-per-day`"
              v-model.number="draft.postsPerDay"
              @input="edited('postsPerDay')"
              class="field small"
              type="number"
              min="0"
              max="10"
              step="1"
            />
          </div>
          <div class="form-row">
            <label :for="`${id}-slots`">
              {{ t('settings.slots') }}
              <span v-if="isProposed('slots')" class="proposed">{{
                t('onboarding.review.proposed')
              }}</span>
            </label>
            <input
              :id="`${id}-slots`"
              v-model="draft.slots"
              @input="edited('slots')"
              class="field"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              :aria-invalid="!!errorFor(`${id}-slots`) || undefined"
              :aria-describedby="`${id}-slots-hint`"
            />
            <p :id="`${id}-slots-hint`" class="hint">{{ t('settings.slotsHint') }}</p>
          </div>
        </div>
      </section>

      <section :aria-labelledby="`${id}-budget`">
        <h2 :id="`${id}-budget`">{{ t('onboarding.review.budget') }}</h2>
        <div class="form-row">
          <label :for="`${id}-budget-input`">{{ t('onboarding.review.budgetLabel') }}</label>
          <input
            :id="`${id}-budget-input`"
            v-model.number="draft.budget"
            class="field small"
            type="number"
            min="0"
            max="10000"
            step="1"
            :aria-describedby="`${id}-budget-hint`"
          />
          <p :id="`${id}-budget-hint`" class="hint">{{ t('onboarding.review.budgetHint') }}</p>
        </div>
      </section>

      <div class="actions">
        <button type="submit" class="button" data-variant="primary" :disabled="creating">
          {{ creating ? t('onboarding.review.creating') : t('onboarding.review.create') }}
        </button>
        <button type="button" class="button" @click="go(withChat ? 'chat' : 'networks')">
          {{ t('onboarding.back') }}
        </button>
        <button type="button" class="button" @click="restart">
          {{ t('onboarding.review.restart') }}
        </button>
      </div>
      <p v-if="createError" class="error" role="alert">{{ createError }}</p>
    </form>
  </div>
</template>

<style scoped>
.onboarding {
  display: grid;
  gap: var(--space-6);
  max-width: 44rem;
}

.steps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-5);
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

.steps li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  counter-increment: step;
}

.steps li::before {
  content: counter(step);
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  font-size: 0.875rem;
  font-weight: 700;
}

.steps li[aria-current='step'] {
  color: var(--color-text);
  font-weight: 700;
}

.steps li[aria-current='step']::before {
  border-color: var(--color-accent-fill);
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
}

.steps li[data-done]::before {
  content: '✓';
}

.step {
  display: grid;
  gap: var(--space-5);
}

.step h1 {
  margin: 0;
}

.lead {
  margin: 0;
}

/* Where a value comes from: the assistant proposed it, the person has not edited it. */
.proposed {
  display: inline-block;
  margin-inline-start: var(--space-2);
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  font-weight: 500;
  vertical-align: middle;
}

.review section {
  display: grid;
  gap: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
}

.review section h2,
.review > p {
  margin: 0;
}

.choices {
  display: grid;
  gap: var(--space-2);
}

.choice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-height: 2.75rem;
  padding: var(--space-2) 0;
}

.choice input {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  margin: 0.15rem 0 0;
  accent-color: var(--color-accent-text);
}

.choice > span {
  display: grid;
  gap: var(--space-1);
}

.subhead {
  margin: var(--space-3) 0 0;
  font-weight: 650;
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
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--space-4);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.error-summary {
  padding: var(--space-4) var(--space-5);
  border: 2px solid var(--color-danger);
  border-radius: var(--radius);
  background: var(--color-surface);
}

.error-summary h2 {
  margin: 0 0 var(--space-2);
  font-size: 1.125rem;
}

.error-summary ul {
  margin: 0;
}
</style>
