<script setup lang="ts">
/**
 * Summary of the topic being created, full screen like the conversation: every setting
 * on one page, editable in place; nothing is saved before "Create the topic". Also the
 * one-page alternative to the conversation ("See everything on one page"). Values the
 * assistant proposed carry a mark until they are edited.
 */
import { useQueryCache } from '@pinia/colada'
import { computed, nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import ContentLangsPicker from '../ContentLangsPicker.vue'
import ChoiceList from './ChoiceList.vue'
import { api } from '../../lib/api'
import { describeError } from '../../lib/errors'
import {
  draftConfig,
  injectOnboardingDraft,
  LISTEN_PLATFORMS,
  parseSlots,
  publishChoices,
  PUBLISH_CHANNELS,
  PUBLISH_EXTRAS,
  setPublishChoices,
  setToolChoices,
  siteUrl,
  toolChoices,
  TOOLS,
  type ProposedField,
  type PublishChoice,
} from '../../lib/onboarding'
import { useWorkspace } from '../../lib/workspace'

const emit = defineEmits<{ back: []; restart: []; created: [] }>()

const { t } = useI18n()
const id = useId()
const router = useRouter()
const queryCache = useQueryCache()
const { workspaceId } = useWorkspace()
const draft = injectOnboardingDraft()

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
  LISTEN_PLATFORMS.map((value) => ({ value, label: t(`onboarding.networks.platforms.${value}`) })),
)
const tools = computed({ get: () => toolChoices(draft), set: (v) => setToolChoices(draft, v) })
const publish = computed({
  get: () => publishChoices(draft),
  set: (v) => setPublishChoices(draft, v),
})

/** An edited field is no longer the assistant's proposal. */
function edited(field: ProposedField) {
  if (draft.proposed.includes(field)) draft.proposed = draft.proposed.filter((f) => f !== field)
}
const isProposed = (field: ProposedField) => draft.proposed.includes(field)

const errors = ref<{ field: string; message: string }[]>([])
const errorSummary = ref<HTMLElement>()
const creating = ref(false)
const createError = ref('')

function validate() {
  const list: { field: string; message: string }[] = []
  if (!draft.name.trim()) list.push({ field: `${id}-name`, message: t('onboarding.errors.name') })
  if (!draft.curation && !draft.engagement)
    list.push({ field: `${id}-tools-list`, message: t('onboarding.errors.tools') })
  if (draft.curation && draft.otherNetwork && !draft.otherNetworkName.trim())
    list.push({ field: `${id}-other`, message: t('onboarding.errors.otherNetwork') })
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

/**
 * The board rebuilds around the new topic: its sidebar slides in while the summary
 * fades (View Transitions), unless motion is reduced. The router then focuses the
 * heading of the overview.
 */
async function openTopic(topicId: string) {
  // The draft is cleared once the summary is captured, as the overview replaces it.
  const navigate = () => {
    emit('created')
    return router.push({ name: 'overview', params: { topicId }, query: { new: '1' } })
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduce) return navigate()
  await document.startViewTransition(async () => {
    await navigate()
    await nextTick()
  }).finished
}

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
      ...(draft.curation && draft.otherNetwork && draft.otherNetworkName.trim()
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
    if (draft.curation && draft.feed) await api.setFeed(topic.id, true).catch(() => undefined)
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
    await queryCache.invalidateQueries({ key: ['topics'] })
    await openTopic(topic.id)
  } catch (err) {
    createError.value = describeError((err as Error).message, t).text
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <form class="form review" novalidate @submit.prevent="create">
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

    <section :aria-labelledby="`${id}-tools`">
      <h2 :id="`${id}-tools`">{{ t('onboarding.review.tools') }}</h2>
      <div :id="`${id}-tools-list`" tabindex="-1">
        <ChoiceList
          v-model="tools"
          :legend="t('onboarding.goal.tools')"
          :options="toolOptions"
          :error="errorFor(`${id}-tools-list`)"
        />
      </div>
    </section>

    <section v-if="draft.curation || draft.engagement" :aria-labelledby="`${id}-networks`">
      <h2 :id="`${id}-networks`">{{ t('onboarding.review.networks') }}</h2>
      <ChoiceList
        v-if="draft.curation"
        v-model="publish"
        :legend="t('onboarding.networks.publish')"
        :options="publishOptions"
      >
        <div v-if="draft.otherNetwork" class="form-row other">
          <label :for="`${id}-other`">{{ t('onboarding.networks.otherName') }}</label>
          <input
            :id="`${id}-other`"
            v-model="draft.otherNetworkName"
            class="field"
            type="text"
            maxlength="60"
            :aria-invalid="!!errorFor(`${id}-other`) || undefined"
          />
        </div>
      </ChoiceList>
      <ChoiceList
        v-if="draft.engagement"
        v-model="draft.listen"
        :legend="t('onboarding.networks.listen')"
        :options="listenOptions"
      />
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
      <button type="button" class="button" @click="emit('back')">
        {{ t('onboarding.review.backToThread') }}
      </button>
      <button type="button" class="button" @click="emit('restart')">
        {{ t('onboarding.review.restart') }}
      </button>
    </div>
    <p v-if="createError" class="error" role="alert">{{ createError }}</p>
  </form>
</template>

<style scoped>
.review {
  display: grid;
  gap: var(--space-5);
}

.review h1,
.review > p {
  margin: 0;
}

.review section {
  display: grid;
  gap: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
}

.review section h2 {
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
