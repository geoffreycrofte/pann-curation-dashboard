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
import PannMark from '../components/PannMark.vue'
import OnboardingRecap from '../components/onboarding/OnboardingRecap.vue'
import OnboardingThread from '../components/onboarding/OnboardingThread.vue'
import PanArt from '../components/onboarding/PanArt.vue'
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
  <div class="creation">
    <header class="bar">
      <p class="brand">
        <PannMark :size="32" />
        <span>{{ t('onboarding.thread.brand') }}</span>
      </p>
      <p class="progress">
        {{
          mode === 'review'
            ? t('onboarding.thread.progressReview')
            : t('onboarding.thread.progress', { done: done, total: steps.length })
        }}
      </p>
      <nav class="links" :aria-label="t('onboarding.thread.navLabel')">
        <button v-if="mode === 'thread'" type="button" class="button" @click="toReview">
          {{ t('onboarding.thread.onePage') }}
        </button>
        <button v-else type="button" class="button" @click="toThread">
          {{ t('onboarding.review.backToThread') }}
        </button>
        <button type="button" class="button" @click="quit">
          {{ t('onboarding.thread.quit') }}
        </button>
      </nav>
    </header>

    <main id="main" tabindex="-1" class="column">
      <template v-if="mode === 'thread'">
        <h1 tabindex="-1">{{ t('onboarding.thread.title') }}</h1>
        <OnboardingThread
          v-if="workspaceId"
          :workspace-id="workspaceId"
          :with-assistant="withAssistant"
          @review="toReview"
        />
      </template>
      <OnboardingRecap v-else @back="toThread" @restart="restart" @created="clear" />
    </main>

    <!-- Each answer drops a flake in the pan; the summary turns them into the nugget. -->
    <div class="art" aria-hidden="true">
      <PanArt :progress="steps.length ? done / steps.length : 0" :complete="mode === 'review'" />
    </div>
  </div>
</template>

<style scoped>
.creation {
  min-height: 100vh;
  background: var(--color-bg);
}

.bar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-5);
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-bg);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-weight: 700;
  font-size: 1.125rem;
}

.progress {
  flex: 1;
  margin: 0;
  color: var(--color-text-muted);
}

.links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.column {
  display: grid;
  gap: var(--space-6);
  width: min(100% - 2 * var(--space-4), 840px);
  margin-inline: auto;
  padding-block: var(--space-7, 3rem) var(--space-8, 6rem);
}

.column:focus {
  outline: none;
}

.column h1 {
  margin: 0;
}

/* Wide screens only: in the right margin, never under the column. */
.art {
  display: none;
}

@media (min-width: 75rem) {
  .art {
    position: fixed;
    right: 0;
    bottom: 0;
    z-index: 0;
    display: block;
    width: calc((100vw - 840px) / 2 - var(--space-6));
    height: min(70vh, 40rem);
    overflow: hidden;
    pointer-events: none;
  }

  .art :deep(.pan-art) {
    position: absolute;
    bottom: 6vh;
    left: var(--space-4);
    width: max(130%, 22rem);
  }
}

@media (max-width: 40rem) {
  /* Three rows on a phone: the bar scrolls away instead of covering the conversation. */
  .bar {
    position: static;
    padding-inline: var(--space-4);
  }

  .progress {
    flex-basis: 100%;
    order: 3;
  }
}
</style>
