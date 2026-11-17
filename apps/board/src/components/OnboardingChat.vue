<script setup lang="ts">
/**
 * Onboarding conversation: a short exchange with the assistant that proposes the
 * settings of the topic. Accessible by design: the exchange is a list with who speaks
 * spelled out, only the latest answer is announced (not the whole log), the field keeps
 * the focus, quick replies fill the field rather than sending behind the person's back,
 * and the form stays one button away at every moment.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type OnboardingContext, type OnboardingSession } from '../lib/api'
import { describeError } from '../lib/errors'

const props = defineProps<{ workspaceId: string; context: OnboardingContext }>()
const sessionId = defineModel<string>('sessionId', { required: true })
const emit = defineEmits<{
  /** A new answer came with its proposal. */
  proposal: [session: OnboardingSession]
  /** The person goes on to the review (finished, or prefers the form). */
  next: []
}>()

const { t } = useI18n()
const id = useId()
const session = ref<OnboardingSession | null>(null)
const startError = ref('')
const answer = ref('')
const field = ref<HTMLTextAreaElement>()
const log = ref<HTMLOListElement>()
/** Text announced to screen readers: the latest answer only. */
const announced = ref('')
/** The answer takes long: the person is offered the form. */
const slow = ref(false)

const POLL_MS = 1500
const SLOW_MS = 30_000
let pollTimer: ReturnType<typeof setTimeout> | undefined
let slowTimer: ReturnType<typeof setTimeout> | undefined
let lastSeen = ''

const pending = computed(() => !session.value || session.value.status === 'pending')
const finished = computed(() => session.value?.status === 'done')
const failed = computed(() => session.value?.status === 'failed')
const messages = computed(() => session.value?.messages ?? [])
const answered = computed(() => messages.value.some((m) => m.role === 'user'))
const quickReplies = computed(() => {
  const last = messages.value.at(-1)
  return session.value?.status === 'idle' && last?.role === 'assistant'
    ? (last.quick_replies ?? [])
    : []
})
const errorText = computed(() =>
  session.value?.error ? describeError(session.value.error, t).text : '',
)

function stopTimers() {
  clearTimeout(pollTimer)
  clearTimeout(slowTimer)
}

function receive(next: OnboardingSession) {
  session.value = next
  if (next.status === 'pending') {
    pollTimer = setTimeout(poll, POLL_MS)
    return
  }
  stopTimers()
  slow.value = false
  if (next.updated_at === lastSeen) return
  lastSeen = next.updated_at
  const last = next.messages.at(-1)
  if (last?.role === 'assistant') announced.value = last.text
  emit('proposal', next)
  void nextTick(() => {
    log.value?.lastElementChild?.scrollIntoView({ block: 'nearest' })
    if (next.status === 'idle') field.value?.focus()
  })
}

async function poll() {
  try {
    receive(await api.onboardingSession(sessionId.value))
  } catch {
    pollTimer = setTimeout(poll, POLL_MS * 2)
  }
}

function waitForAnswer() {
  slow.value = false
  clearTimeout(slowTimer)
  slowTimer = setTimeout(() => (slow.value = true), SLOW_MS)
}

async function start() {
  startError.value = ''
  waitForAnswer()
  try {
    if (sessionId.value) {
      const existing = await api.onboardingSession(sessionId.value).catch(() => null)
      if (existing) {
        lastSeen = existing.updated_at
        return receive(existing)
      }
    }
    const created = await api.startOnboarding(props.workspaceId, props.context)
    sessionId.value = created.id
    receive(created)
  } catch (err) {
    stopTimers()
    startError.value = describeError((err as Error).message, t).text
  }
}

async function send() {
  const text = answer.value.trim()
  if (!text || pending.value || finished.value || failed.value) return
  startError.value = ''
  try {
    const next = await api.answerOnboarding(sessionId.value, text)
    answer.value = ''
    announced.value = ''
    waitForAnswer()
    receive(next)
  } catch (err) {
    startError.value = describeError((err as Error).message, t).text
  }
}

async function retry() {
  waitForAnswer()
  try {
    receive(await api.retryOnboarding(sessionId.value))
  } catch (err) {
    startError.value = describeError((err as Error).message, t).text
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    void send()
  }
}

function useReply(text: string) {
  answer.value = text
  field.value?.focus()
}

watch(finished, (done) => {
  if (done) void nextTick(() => document.getElementById(`${id}-next`)?.focus())
})

onMounted(start)
onBeforeUnmount(stopTimers)
</script>

<template>
  <div class="chat">
    <ol ref="log" class="log" :aria-label="t('onboarding.chat.log')">
      <li v-for="(message, index) in messages" :key="index" :data-role="message.role">
        <span class="who">
          {{
            message.role === 'assistant'
              ? t('onboarding.chat.assistant')
              : t('onboarding.chat.you')
          }}<span class="visually-hidden">{{ t('onboarding.chat.separator') }}</span>
        </span>
        <p class="text">{{ message.text }}</p>
      </li>
    </ol>

    <!-- Only the latest answer is spoken, once; the status says when the assistant writes. -->
    <p class="visually-hidden" aria-live="polite">{{ announced }}</p>
    <p class="status" :class="{ 'visually-hidden': !pending || startError }" role="status">
      <template v-if="pending && !startError">{{ t('onboarding.chat.writing') }}</template>
    </p>

    <div v-if="startError || failed" class="problem" role="alert">
      <p>{{ startError || errorText || t('onboarding.chat.failed') }}</p>
      <div class="actions">
        <button v-if="failed" type="button" class="button" @click="retry">
          {{ t('onboarding.chat.retry') }}
        </button>
        <button type="button" class="button" @click="emit('next')">
          {{ t('onboarding.chat.toForm') }}
        </button>
      </div>
    </div>
    <div v-else-if="slow && pending" class="problem" role="alert">
      <p>{{ t('onboarding.chat.slow') }}</p>
      <div class="actions">
        <button type="button" class="button" @click="emit('next')">
          {{ t('onboarding.chat.toForm') }}
        </button>
      </div>
    </div>

    <form v-if="!finished" class="reply" novalidate @submit.prevent="send">
      <div
        v-if="quickReplies.length"
        class="quick"
        role="group"
        :aria-label="t('onboarding.chat.quick')"
      >
        <button
          v-for="reply in quickReplies"
          :key="reply"
          type="button"
          class="button"
          @click="useReply(reply)"
        >
          {{ reply }}
        </button>
      </div>
      <div class="form-row">
        <label :for="`${id}-answer`">{{ t('onboarding.chat.answer') }}</label>
        <textarea
          :id="`${id}-answer`"
          ref="field"
          v-model="answer"
          class="field"
          rows="2"
          maxlength="2000"
          :aria-describedby="`${id}-answer-hint`"
          @keydown="onKeydown"
        ></textarea>
        <p :id="`${id}-answer-hint`" class="hint">{{ t('onboarding.chat.answerHint') }}</p>
      </div>
      <div class="actions">
        <button
          type="submit"
          class="button"
          data-variant="primary"
          :aria-disabled="pending || !answer.trim() || undefined"
        >
          {{ t('onboarding.chat.send') }}
        </button>
        <button type="button" class="button" @click="emit('next')">
          {{ answered ? t('onboarding.chat.finish') : t('onboarding.chat.toForm') }}
        </button>
      </div>
    </form>
    <div v-else class="actions">
      <button
        :id="`${id}-next`"
        type="button"
        class="button"
        data-variant="primary"
        @click="emit('next')"
      >
        {{ t('onboarding.chat.review') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat {
  display: grid;
  gap: var(--space-4);
}

.log {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.log li {
  display: grid;
  gap: var(--space-1);
  max-width: 36rem;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.log li[data-role='user'] {
  justify-self: end;
  border-color: var(--color-accent-fill);
}

.who {
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-weight: 650;
}

.text {
  margin: 0;
  white-space: pre-line;
}

.status {
  margin: 0;
  color: var(--color-text-muted);
}

.problem {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 2px solid var(--color-danger);
  border-radius: var(--radius);
  background: var(--color-surface);
}

.problem p {
  margin: 0;
}

.reply {
  display: grid;
  gap: var(--space-3);
}

.quick,
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
}

.field {
  width: 100%;
  resize: vertical;
}
</style>
