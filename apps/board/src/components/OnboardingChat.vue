<script setup lang="ts">
/**
 * The assistant's part of the creation conversation: a short exchange that proposes
 * what defines the topic (what it is, for whom, messages, voice). Accessible by design:
 * every message says who speaks, only the latest answer is announced (not the whole
 * log), the field keeps the focus, quick replies fill the field rather than sending
 * behind the person's back, and going on without the assistant is one button away.
 * Once the person moved on (`active` false), only the exchange stays, read-only.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ApiError, api, type OnboardingContext, type OnboardingSession } from '../lib/api'
import { describeError } from '../lib/errors'

const props = withDefaults(
  defineProps<{ workspaceId: string; context: OnboardingContext; active?: boolean }>(),
  { active: true },
)
const sessionId = defineModel<string>('sessionId', { required: true })
const emit = defineEmits<{
  /** A new answer came with its proposal. */
  proposal: [session: OnboardingSession]
  /** The exchange is over (finished, or the person goes on). */
  next: []
  /** The assistant cannot run here: its questions are asked as text instead. */
  unavailable: []
}>()

const { t } = useI18n()
const id = useId()
const session = ref<OnboardingSession | null>(null)
const startError = ref('')
const answer = ref('')
const field = ref<HTMLTextAreaElement>()
/** Text announced to screen readers: the latest answer only. */
const announced = ref('')
/** The answer takes long: going on without it is offered. */
const slow = ref(false)

const POLL_MS = 1500
const SLOW_MS = 30_000
const UNAVAILABLE = ['onboarding_unavailable', 'onboarding_credit_exhausted']
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
  if (!props.active) return
  if (next.status === 'pending') {
    pollTimer = setTimeout(poll, POLL_MS)
    return
  }
  stopTimers()
  slow.value = false
  // Out of credit or without key before a single answer: the questions go on as text.
  const spoke = next.messages.some((m) => m.role === 'assistant')
  if (!spoke && next.error && UNAVAILABLE.includes(next.error)) {
    emit('unavailable')
    return
  }
  if (next.updated_at === lastSeen) return
  lastSeen = next.updated_at
  const last = next.messages.at(-1)
  if (last?.role === 'assistant') announced.value = last.text
  emit('proposal', next)
  void nextTick(() => {
    if (next.status === 'idle') field.value?.focus()
    else if (next.status === 'done') document.getElementById(`${id}-next`)?.focus()
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
  if (props.active) waitForAnswer()
  try {
    if (sessionId.value) {
      const existing = await api.onboardingSession(sessionId.value).catch(() => null)
      if (existing) {
        lastSeen = existing.updated_at
        return receive(existing)
      }
    }
    if (!props.active) return
    const created = await api.startOnboarding(props.workspaceId, props.context)
    sessionId.value = created.id
    receive(created)
  } catch (err) {
    stopTimers()
    if (err instanceof ApiError && err.status === 409) return emit('unavailable')
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

watch(
  () => props.active,
  (active) => {
    if (!active) stopTimers()
  },
)

onMounted(start)
onBeforeUnmount(stopTimers)
</script>

<template>
  <div class="assistant">
    <ol class="log" :aria-label="t('onboarding.chat.log')">
      <li v-for="(message, index) in messages" :key="index">
        <p class="bubble" :data-from="message.role === 'assistant' ? 'assistant' : 'you'">
          <span class="who">
            {{
              message.role === 'assistant'
                ? t('onboarding.chat.assistant')
                : t('onboarding.chat.you')
            }}<span class="visually-hidden">{{ t('onboarding.chat.separator') }}</span>
          </span>
          <span class="text">{{ message.text }}</span>
        </p>
      </li>
    </ol>

    <template v-if="active">
      <!-- Only the latest answer is spoken, once; the status says when the assistant writes. -->
      <p class="visually-hidden" aria-live="polite">{{ announced }}</p>
      <p
        class="status bubble"
        data-from="assistant"
        :class="{ 'visually-hidden': !pending || startError }"
        role="status"
      >
        <template v-if="pending && !startError">
          {{ t('onboarding.chat.writing') }}
          <span class="typing" aria-hidden="true"><span></span><span></span><span></span></span>
        </template>
      </p>

      <div v-if="startError || failed" class="problem" role="alert">
        <p>{{ startError || errorText || t('onboarding.chat.failed') }}</p>
        <div class="actions">
          <button v-if="failed" type="button" class="button" @click="retry">
            {{ t('onboarding.chat.retry') }}
          </button>
          <button type="button" class="button" @click="emit('unavailable')">
            {{ t('onboarding.chat.withoutAssistant') }}
          </button>
        </div>
      </div>
      <div v-else-if="slow && pending" class="problem" role="alert">
        <p>{{ t('onboarding.chat.slow') }}</p>
        <div class="actions">
          <button type="button" class="button" @click="emit('unavailable')">
            {{ t('onboarding.chat.withoutAssistant') }}
          </button>
        </div>
      </div>

      <form v-if="!finished" class="compose" novalidate @submit.prevent="send">
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
          <button
            type="button"
            class="button"
            @click="answered ? emit('next') : emit('unavailable')"
          >
            {{ answered ? t('onboarding.chat.finish') : t('onboarding.chat.withoutAssistant') }}
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
          {{ t('onboarding.chat.continue') }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.assistant,
.log {
  display: grid;
  gap: var(--space-3);
}

.log {
  margin: 0;
  padding: 0;
  list-style: none;
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
