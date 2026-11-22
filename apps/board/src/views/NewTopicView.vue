<script setup lang="ts">
/**
 * Creating a topic, full screen and without the board around it: a conversation (fixed
 * choices as closed questions, what defines the topic with the AI assistant when it is
 * available), then a summary of every setting. "See everything on one page" opens the
 * summary at any moment. Nothing is saved before "Create the topic"; the board then
 * rebuilds around the new topic. The draft lives in the session (survives a reload).
 */
import type { Plan } from '@glimr/shared'
import { useQuery, useQueryCache } from '@pinia/colada'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import FullScreen from '../components/onboarding/FullScreen.vue'
import OnboardingRecap from '../components/onboarding/OnboardingRecap.vue'
import OnboardingThread from '../components/onboarding/OnboardingThread.vue'
import HeroProspector from '../components/HeroProspector.vue'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { toast } from '../lib/toast'
import PlanPicker from '../components/PlanPicker.vue'
import { provideOnboardingDraft, threadSteps, useOnboardingDraft } from '../lib/onboarding'
import { useWorkspace } from '../lib/workspace'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { workspaceId } = useWorkspace()
const { draft, clear } = useOnboardingDraft()
provideOnboardingDraft(draft)

// The assistant's part exists only when Glimr's assistant can run for this workspace (key
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
// A new workspace starts its trial by picking an offer; one that no longer runs must pay.
const mustChoose = computed(
  () => plan.value?.billing_status === 'trialing' && !plan.value.plan_chosen_at,
)
const inactive = computed(() => plan.value?.active === false)
const { data: plans } = useQuery({
  key: ['public-plans'],
  query: api.publicPlans,
  enabled: () => mustChoose.value,
})
const queryCache = useQueryCache()
const choosing = ref(false)
async function choose(planKey: Plan) {
  if (!workspaceId.value) return
  choosing.value = true
  try {
    await api.choosePlan(workspaceId.value, planKey)
    await queryCache.invalidateQueries({ key: ['workspace-plan'] })
    toast(t('onboarding.plan.chosen', { plan: t(`plans.names.${planKey}`) }))
  } catch (err) {
    toast(describeError((err as Error).message, t).text)
  } finally {
    choosing.value = false
  }
}
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

    <template v-if="inactive">
      <h1 tabindex="-1">{{ t('onboarding.inactive.title') }}</h1>
      <p class="notice notice-inline" data-tone="danger" role="note">
        <span>
          {{ t('errors.billing_inactive') }}
          <RouterLink :to="{ name: 'profile', query: { tab: 'workspace', offer: 'open' } }">{{
            t('billing.banner.link')
          }}</RouterLink>
        </span>
      </p>
    </template>
    <template v-else-if="mustChoose">
      <h1 tabindex="-1">{{ t('onboarding.plan.title') }}</h1>
      <p class="lead">{{ t('onboarding.plan.lead') }}</p>
      <PlanPicker
        v-if="plans"
        :plans="plans"
        mode="trial"
        :busy="choosing"
        :heading-level="2"
        @choose="(p) => choose(p)"
      />
    </template>
    <template v-else-if="atLimit && plan">
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
