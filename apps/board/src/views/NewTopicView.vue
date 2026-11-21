<script setup lang="ts">
/**
 * Creating a topic, full screen and without the board around it: a conversation (fixed
 * choices as closed questions, what defines the topic with the AI assistant when it is
 * available), then a summary of every setting. "See everything on one page" opens the
 * summary at any moment. Nothing is saved before "Create the topic"; the board then
 * rebuilds around the new topic. The draft lives in the session (survives a reload).
 */
import { useQuery } from '@pinia/colada'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import FullScreen from '../components/onboarding/FullScreen.vue'
import OnboardingRecap from '../components/onboarding/OnboardingRecap.vue'
import OnboardingThread from '../components/onboarding/OnboardingThread.vue'
import HeroProspector from '../components/HeroProspector.vue'
import { api } from '../lib/api'
import { provideOnboardingDraft, threadSteps, useOnboardingDraft } from '../lib/onboarding'
import { useWorkspace } from '../lib/workspace'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { workspaceId } = useWorkspace()
const { draft, clear } = useOnboardingDraft()
provideOnboardingDraft(draft)

// The assistant's part exists only when Pann's assistant can run for this workspace (key
// set, onboarding credit and monthly cap not reached); otherwise its questions are text.
// The offer may allow no other topic: say so before the person spends time on the setup.
const { data: plan } = useQuery({
  key: () => ['workspace-plan', workspaceId.value ?? ''],
  query: () => api.workspacePlan(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})
const atLimit = computed(
  () =>
    !!plan.value && plan.value.max_topics !== null && plan.value.topics >= plan.value.max_topics,
)
const { data: assistant } = useQuery({
  key: () => ['onboarding-available', workspaceId.value ?? ''],
  query: () => api.onboardingAvailable(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})
const withAssistant = computed(
  () => (assistant.value?.available === true || !!draft.sessionId) && !draft.assistantOff,
)

const mode = computed(() => (route.query.step === 'review' ? 'review' : 'thread'))
const steps = computed(() => threadSteps(draft, withAssistant.value))
const done = computed(() => steps.value.filter((s) => draft.answered.includes(s)).length)

function toReview() {
  void router.push({ query: { step: 'review' } })
}
function toThread() {
  void router.push({ query: {} })
}
function restart() {
  clear()
  void router.push({ query: {} })
}
/** Back where the person came from; the draft is kept for later. */
function quit() {
  if (window.history.state?.back) router.back()
  else void router.push({ name: 'home' })
}
</script>

<template>
  <FullScreen
    :status="
      mode === 'review'
        ? t('onboarding.thread.progressReview')
        : t('onboarding.thread.progress', { done: done, total: steps.length })
    "
    :nav-label="t('onboarding.thread.navLabel')"
  >
    <template #links>
      <button v-if="mode === 'thread'" type="button" class="button" @click="toReview">
        {{ t('onboarding.thread.onePage') }}
      </button>
      <button v-else type="button" class="button" @click="toThread">
        {{ t('onboarding.review.backToThread') }}
      </button>
      <button type="button" class="button" @click="quit">
        {{ t('onboarding.thread.quit') }}
      </button>
    </template>

    <template v-if="atLimit && plan">
      <h1 tabindex="-1">{{ t('onboarding.limit.title') }}</h1>
      <p class="notice" role="note">
        {{
          t('onboarding.limit.text', {
            plan: t(`plans.names.${plan.plan}`),
            max: plan.max_topics,
          })
        }}
        <RouterLink :to="{ name: 'profile' }">{{ t('onboarding.limit.link') }}</RouterLink>
      </p>
    </template>
    <template v-else-if="mode === 'thread'">
      <h1 tabindex="-1">{{ t('onboarding.thread.title') }}</h1>
      <OnboardingThread
        v-if="workspaceId"
        :workspace-id="workspaceId"
        :with-assistant="withAssistant"
        @review="toReview"
      />
    </template>
    <OnboardingRecap v-else @back="toThread" @restart="restart" @created="clear" />

    <!-- The prospector of the public page, his pan catching the gold: decorative. -->
    <template #art>
      <HeroProspector alt="" sizes="22rem" />
    </template>
  </FullScreen>
</template>
