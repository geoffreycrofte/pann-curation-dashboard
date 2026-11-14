<script setup lang="ts">
import {
  accountFor,
  DRAFT_CHANNELS,
  LANGS,
  POST_LIMITS,
  postSignature,
  SOURCE_TEXT_MAX,
  SOURCE_TEXT_MIN,
  publishedLength,
  type DraftChannel,
  type Lang,
  type PostDraft,
} from '@pann/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger,
} from 'reka-ui'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FirstCommentEditor from '../components/FirstCommentEditor.vue'
import KindSelect from '../components/KindSelect.vue'
import TextSaver, { type RewritePreset } from '../components/TextSaver.vue'
import { api, type RewriteInput } from '../lib/api'
import { describeError } from '../lib/errors'
import { useWorkspace } from '../lib/workspace'
import { toast } from '../lib/toast'

const props = defineProps<{ topicId: string; itemId: string }>()
const { t, d } = useI18n()
const queryCache = useQueryCache()
const key = () => ['item', props.topicId, props.itemId]

const {
  data: detail,
  isPending,
  error,
} = useQuery({
  key,
  query: () => api.item(props.topicId, props.itemId),
})

const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const { workspaceId } = useWorkspace()
const { data: credentials } = useQuery({
  key: () => ['credentials', workspaceId.value ?? ''],
  query: () => api.credentials(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})

/** Publication requested: refresh until the posts have left the queue. */
const publishingUntil = ref(0)

// While drafting or publishing runs, refresh every 3 s.
let poller: ReturnType<typeof setInterval> | undefined
watch(
  () =>
    detail.value?.draft_status === 'pending' ||
    !!detail.value?.posts.some((p) => p.claimed_at) ||
    publishingUntil.value > 0,
  (busy) => {
    if (busy && !poller) {
      poller = setInterval(() => queryCache.invalidateQueries({ key: key() }), 3000)
    } else if (!busy && poller) {
      clearInterval(poller)
      poller = undefined
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => poller && clearInterval(poller))

const excerpt = computed(() => detail.value?.summaries.find((s) => s.key_excerpt)?.key_excerpt)
const nature = computed(() => detail.value?.summaries.find((s) => s.source_nature)?.source_nature)
const model = computed(() => detail.value?.summaries[0]?.model)
const canDraft = computed(() => ['validated', 'published'].includes(detail.value?.status ?? ''))

const message = ref('')
const isError = ref(false)

const { mutate: saveKind, isLoading: savingKind } = useMutation({
  mutation: (kind: string | null) => api.setItemKind(props.topicId, props.itemId, kind),
  async onSuccess() {
    isError.value = false
    message.value = ''
    toast(t('itemKind.saved'))
    await queryCache.invalidateQueries({ key: key() })
    await queryCache.invalidateQueries({ key: ['items', props.topicId] })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
const { mutate: regenerate, isLoading: regenerating } = useMutation({
  mutation: () => api.requestDraft(props.topicId, props.itemId),
  async onSuccess() {
    isError.value = false
    message.value = t('draft.regenerated')
    await queryCache.invalidateQueries({ key: key() })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})

// Pasted source text: for pages Pann cannot read (paywall, page built by script).
const sourceTextId = useId()
const sourceText = ref('')
const sourceTextLength = computed(() => sourceText.value.trim().length)
const insufficient = computed(() => detail.value?.draft_error === 'insufficient_content')
const { mutate: submitSourceText, isLoading: submittingSource } = useMutation({
  mutation: () => api.submitSourceText(props.topicId, props.itemId, sourceText.value.trim()),
  async onSuccess() {
    isError.value = false
    message.value = t('draft.sourceText.sent')
    sourceText.value = ''
    await queryCache.invalidateQueries({ key: key() })
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
function sendSourceText() {
  if (sourceTextLength.value < SOURCE_TEXT_MIN) {
    isError.value = true
    message.value = t('draft.sourceText.tooShort', { min: SOURCE_TEXT_MIN })
    return
  }
  submitSourceText()
}

// AI rewrite: the job usually answers in a few seconds; the board polls its result.
async function rewriteText(
  target: RewriteInput['target'],
  text: string,
  preset: RewritePreset,
  instruction?: string,
): Promise<string> {
  const { id } = await api.rewrite(props.topicId, props.itemId, {
    text,
    preset,
    instruction,
    target,
  })
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const result = await api.rewriteResult(props.topicId, id)
    if (result.status === 'done' && result.result) return result.result
    if (result.status === 'failed')
      throw new Error(describeError(result.error ?? 'unexpected', t).text)
  }
  throw new Error(t('rewrite.timeout'))
}

/** Look of the drafting status block: tone and icon follow the state. */
const draftTone = computed(
  () =>
    ({ none: 'neutral', pending: 'accent', ready: 'success', failed: 'danger' })[
      detail.value?.draft_status ?? 'none'
    ],
)

async function saveSummary(lang: string, text: string) {
  await api.updateSummary(props.topicId, props.itemId, lang, text)
  await queryCache.invalidateQueries({ key: key() })
}
// ---------------------------------------------------------------------------
// Diffusion
// ---------------------------------------------------------------------------
const url = computed(() => detail.value?.item.canonical_url ?? '')
const mastodonLimit = computed(
  () =>
    credentials.value?.find((c) => c.provider === 'mastodon')?.meta.max_characters ??
    POST_LIMITS.mastodon,
)
const limitOf = (channel: DraftChannel) =>
  channel === 'mastodon' ? mastodonLimit.value : POST_LIMITS[channel]
const hasAccount = (post: PostDraft) =>
  !!topic.value && !!post.lang && !!accountFor(topic.value.config, post.channel, post.lang)

const posts = computed(() => detail.value?.posts ?? [])
/** Posts of a network, always in the order of LANGS: saving one must not move it. */
/** Channels with at least one post: X, Facebook and Discord only where the topic uses them. */
const postChannels = computed(() =>
  DRAFT_CHANNELS.filter((channel) => posts.value.some((p) => p.channel === channel)),
)
const postsOf = (channel: DraftChannel) =>
  posts.value
    .filter((p) => p.channel === channel)
    .sort((a, b) => LANGS.indexOf(a.lang as Lang) - LANGS.indexOf(b.lang as Lang))
const postTone = (post: PostDraft) =>
  post.status === 'sent'
    ? 'success'
    : post.status === 'failed'
      ? 'danger'
      : post.status === 'scheduled' || post.claimed_at
        ? 'accent'
        : undefined
const canDiffuse = computed(
  () =>
    ['validated', 'published'].includes(detail.value?.status ?? '') &&
    detail.value?.draft_status === 'ready' &&
    posts.value.length > 0,
)
const hasChannels = computed(() => (topic.value?.config.channels.length ?? 0) > 0)
const toSchedule = computed(() =>
  posts.value.filter((p) => ['draft', 'failed'].includes(p.status) && hasAccount(p)),
)
const onlyFailed = computed(
  () => toSchedule.value.length > 0 && toSchedule.value.every((p) => p.status === 'failed'),
)
const queued = computed(() => posts.value.filter((p) => p.status === 'scheduled'))
const canUnschedule = computed(
  () => queued.value.length > 0 && queued.value.every((p) => !p.claimed_at),
)
// Slots are set in the topic's time zone: dates are shown in it too.
const formatDate = (value: string) =>
  d(new Date(value), {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: topic.value?.config.schedule.timezone,
  })

const diffusionMessage = ref('')
const diffusionError = ref(false)
function diffusionFailed(err: Error) {
  diffusionError.value = true
  diffusionMessage.value = describeError(err.message, t).text
}

const { mutate: schedule, isLoading: scheduling } = useMutation({
  mutation: (when: 'next_slot' | 'now') => api.schedule(props.topicId, props.itemId, when),
  async onSuccess(result, when) {
    diffusionError.value = false
    if (when === 'now') {
      diffusionMessage.value = t('diffusion.publishing')
      publishingUntil.value = Date.now() + 60_000
      setTimeout(() => (publishingUntil.value = 0), 60_000)
    } else {
      diffusionMessage.value = t('diffusion.scheduled', { date: formatDate(result.publish_at) })
    }
    await queryCache.invalidateQueries({ key: key() })
    await queryCache.invalidateQueries({ key: ['queue', props.topicId] })
    await queryCache.invalidateQueries({ key: ['items', props.topicId] })
  },
  onError: diffusionFailed,
})

const { mutate: unschedule, isLoading: unscheduling } = useMutation({
  mutation: () => api.unschedule(props.topicId, props.itemId),
  async onSuccess() {
    diffusionError.value = false
    diffusionMessage.value = t('diffusion.unscheduled')
    await queryCache.invalidateQueries({ key: key() })
    await queryCache.invalidateQueries({ key: ['queue', props.topicId] })
    await queryCache.invalidateQueries({ key: ['items', props.topicId] })
  },
  onError: diffusionFailed,
})

/** Text added at the end of the post when published (LinkedIn signature of the topic). */
const signatureOf = (post: PostDraft) =>
  topic.value && post.lang ? postSignature(topic.value.config, post.channel, post.lang) : ''
const defaultCommentOf = (post: PostDraft) =>
  topic.value && post.lang ? topic.value.config.linkedin.first_comment[post.lang] : ''

async function saveFirstComment(postId: string, value: string | null) {
  await api.updateFirstComment(props.topicId, postId, value)
  await queryCache.invalidateQueries({ key: key() })
}

async function savePost(postId: string, text: string) {
  await api.updatePost(props.topicId, postId, text)
  await queryCache.invalidateQueries({ key: key() })
}
</script>

<template>
  <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <template v-else-if="detail">
    <p>
      <RouterLink :to="{ name: 'board', params: { topicId }, query: { status: detail.status } }">
        {{ t('draft.back') }}
      </RouterLink>
    </p>
    <h1 tabindex="-1" :lang="detail.item.source_lang ?? undefined">{{ detail.item.title }}</h1>
    <ul class="meta">
      <li>
        <span
          class="badge"
          data-dot
          :data-tone="
            detail.status === 'validated' || detail.status === 'published'
              ? 'success'
              : detail.status === 'rejected'
                ? 'danger'
                : undefined
          "
        >
          {{ t(`statusOne.${detail.status}`) }}
        </span>
      </li>
      <li class="kind-field">
        <!-- The kind of the item in this topic: set by the source, the triage or here. -->
        <label for="item-kind">{{ t('itemKind.label') }}</label>
        <KindSelect
          id="item-kind"
          :topic-id="topicId"
          :model-value="detail.kind"
          :disabled="savingKind"
          @update:model-value="(kind) => saveKind(kind)"
        />
      </li>
      <li v-if="detail.relevance_score !== null">
        {{ t('board.relevance', { score: detail.relevance_score }) }}
      </li>
      <li v-if="detail.is_commercial">{{ t('board.commercial') }}</li>
      <li>
        {{
          t('board.discovered', {
            date: d(new Date(detail.item.discovered_at), { dateStyle: 'medium' }),
          })
        }}
      </li>
    </ul>
    <p>
      <a :href="detail.item.canonical_url" target="_blank" rel="noopener noreferrer">{{
        t('draft.source')
      }}</a>
    </p>
    <p v-if="detail.triage_reason">{{ t('board.reason', { reason: detail.triage_reason }) }}</p>

    <section class="block draft-state" :data-tone="draftTone" aria-labelledby="drafting-status">
      <span class="state-icon" aria-hidden="true">
        <svg v-if="detail.draft_status === 'ready'" viewBox="0 0 24 24" width="22" height="22">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <svg
          v-else-if="detail.draft_status === 'pending'"
          class="spin"
          viewBox="0 0 24 24"
          width="22"
          height="22"
        >
          <path
            d="M12 3a9 9 0 1 1-9 9"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
          />
        </svg>
        <svg
          v-else-if="detail.draft_status === 'failed'"
          viewBox="0 0 24 24"
          width="22"
          height="22"
        >
          <path
            d="M12 7v6M12 16.5v.5"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
          />
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="22" height="22">
          <path
            d="M6 18h12M8 14l7.5-7.5 2 2L10 16H8z"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <div class="state-text">
        <h2 id="drafting-status">{{ t(`draft.status.${detail.draft_status}`) }}</h2>
        <p v-if="model" class="hint">{{ t('draft.model', { model }) }}</p>
        <p v-if="!canDraft" class="hint">{{ t('draft.notValidated') }}</p>
        <p v-if="detail.draft_error" class="error">
          {{ describeError(detail.draft_error, t).text }}
          <RouterLink v-if="describeError(detail.draft_error, t).provider" to="/connections">
            {{ t('errors.fixInConnections') }}
          </RouterLink>
        </p>
      </div>
      <div v-if="canDraft" class="state-action">
        <AlertDialogRoot>
          <AlertDialogTrigger as-child>
            <button
              type="button"
              class="button"
              :disabled="regenerating || detail.draft_status === 'pending'"
              aria-describedby="regenerate-hint"
            >
              {{ t('draft.regenerate') }}
            </button>
          </AlertDialogTrigger>
          <AlertDialogPortal>
            <AlertDialogOverlay class="dialog-overlay" />
            <AlertDialogContent class="dialog">
              <AlertDialogTitle class="dialog-title">{{
                t('draft.confirmTitle')
              }}</AlertDialogTitle>
              <AlertDialogDescription as="div" class="confirm-text">
                <p>{{ t('draft.confirmReplaced') }}</p>
                <p>{{ t('draft.confirmKept') }}</p>
                <p>{{ t('draft.confirmCost') }}</p>
              </AlertDialogDescription>
              <div class="dialog-actions">
                <AlertDialogCancel class="button">{{ t('common.cancel') }}</AlertDialogCancel>
                <AlertDialogAction class="button" data-variant="primary" @click="regenerate()">
                  {{ t('draft.regenerate') }}
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialogRoot>
        <p id="regenerate-hint" class="hint">{{ t('draft.regenerateHint') }}</p>
      </div>
      <details
        v-if="canDraft && detail.draft_status !== 'pending'"
        class="source-text"
        :open="insufficient"
      >
        <summary>{{ t('draft.sourceText.toggle') }}</summary>
        <form class="source-text-form" @submit.prevent="sendSourceText">
          <p>{{ t('draft.sourceText.intro') }}</p>
          <label :for="`${sourceTextId}-text`">{{ t('draft.sourceText.label') }}</label>
          <textarea
            :id="`${sourceTextId}-text`"
            v-model="sourceText"
            class="field"
            rows="10"
            :maxlength="SOURCE_TEXT_MAX"
            :aria-describedby="`${sourceTextId}-hint`"
          ></textarea>
          <p :id="`${sourceTextId}-hint`" class="hint">
            {{ t('draft.sourceText.hint', { count: sourceTextLength, min: SOURCE_TEXT_MIN }) }}
          </p>
          <button type="submit" class="button" data-variant="primary" :disabled="submittingSource">
            {{ t('draft.sourceText.submit') }}
          </button>
        </form>
      </details>
      <p
        role="status"
        class="state-message"
        :class="{ error: isError, 'visually-hidden': !isError }"
      >
        {{ message }}
      </p>
    </section>

    <section v-if="detail.summaries.length" class="block" aria-labelledby="summaries">
      <h2 id="summaries">{{ t('draft.summaries') }}</h2>
      <p v-if="nature">{{ t('draft.sourceNature', { nature: t(`draft.natures.${nature}`) }) }}</p>
      <figure v-if="excerpt" class="excerpt">
        <figcaption class="hint">{{ t('draft.excerpt') }}</figcaption>
        <blockquote :lang="detail.item.source_lang ?? undefined">{{ excerpt }}</blockquote>
      </figure>
      <div class="pair">
        <template v-for="lang in LANGS" :key="lang">
          <TextSaver
            v-if="detail.summaries.find((s) => s.lang === lang)"
            :label="t('draft.summaryLabel', { lang: t(`draft.langs.${lang}`) })"
            :value="detail.summaries.find((s) => s.lang === lang)!.summary"
            :lang="lang"
            :edited="detail.summaries.find((s) => s.lang === lang)!.edited_by_human"
            :description="t('draft.summaryUse')"
            :save="(text) => saveSummary(lang, text)"
            :rewrite="
              (text, preset, instruction) =>
                rewriteText({ kind: 'summary', lang }, text, preset, instruction)
            "
          />
        </template>
      </div>
    </section>

    <section v-if="detail.posts.length" class="block" aria-labelledby="posts">
      <h2 id="posts">{{ t('draft.posts') }}</h2>
      <section v-for="channel in postChannels" :key="channel" :aria-labelledby="`posts-${channel}`">
        <h3 :id="`posts-${channel}`">{{ t(`draft.channels.${channel}`) }}</h3>
        <div class="pair">
          <div v-for="post in postsOf(channel)" :key="post.id" class="post">
            <TextSaver
              :label="
                t('draft.postLabel', {
                  channel: t(`draft.channels.${channel}`),
                  lang: t(`draft.langs.${post.lang}`),
                })
              "
              :value="post.body"
              :lang="post.lang ?? undefined"
              :limit="limitOf(channel)"
              :limit-name="t(`draft.channels.${channel}`)"
              :measure="(text) => publishedLength(channel, text, url, signatureOf(post))"
              :length-key="
                signatureOf(post) ? 'diffusion.lengthWithSignature' : 'diffusion.lengthWithLink'
              "
              :readonly="post.status === 'sent' || !!post.claimed_at"
              :edited="post.edited_by_human"
              :save="(text) => savePost(post.id, text)"
              :rewrite="
                post.lang
                  ? (text, preset, instruction) =>
                      rewriteText(
                        { kind: 'post', lang: post.lang!, channel },
                        text,
                        preset,
                        instruction,
                      )
                  : undefined
              "
            />
            <p v-if="signatureOf(post)" class="hint signature" :lang="post.lang ?? undefined">
              <span>{{ t('diffusion.signature') }}</span>
              {{ signatureOf(post) }}
            </p>
            <FirstCommentEditor
              v-if="channel === 'linkedin'"
              :value="post.first_comment"
              :default-text="defaultCommentOf(post)"
              :lang="post.lang ?? undefined"
              :readonly="post.status === 'sent' || !!post.claimed_at"
              :save="(value) => saveFirstComment(post.id, value)"
            />
            <p class="post-status" :data-status="post.status">
              <span class="badge" data-dot :data-tone="postTone(post)">{{
                post.claimed_at ? t('diffusion.claimed') : t(`diffusion.postStatus.${post.status}`)
              }}</span>
              <span v-if="post.status === 'scheduled' && post.scheduled_at">
                {{ t('diffusion.scheduledFor', { date: formatDate(post.scheduled_at) }) }}
              </span>
              <span v-if="post.status === 'sent' && post.sent_at">
                {{ t('diffusion.sentOn', { date: formatDate(post.sent_at) }) }}
              </span>
              <a
                v-if="post.published_url"
                :href="post.published_url"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="
                  t('diffusion.viewLabel', {
                    channel: t(`draft.channels.${channel}`),
                    lang: t(`draft.langs.${post.lang}`),
                  })
                "
                >{{ t('diffusion.view') }}</a
              >
            </p>
            <p v-if="post.last_error && post.status !== 'sent'" class="error">
              {{ describeError(post.last_error, t).text }}
            </p>
            <p v-if="topic && post.status !== 'sent' && !hasAccount(post)" class="hint">
              {{ t('diffusion.noAccountFor') }}
            </p>
          </div>
        </div>
      </section>
    </section>

    <section v-if="detail.posts.length" class="block" aria-labelledby="diffusion">
      <h2 id="diffusion">{{ t('diffusion.title') }}</h2>
      <p class="hint">{{ t('diffusion.intro') }}</p>
      <p v-if="detail.publish_at && queued.length">
        {{ t('diffusion.scheduledFor', { date: formatDate(detail.publish_at) }) }}
      </p>
      <p v-if="!canDiffuse">{{ t('diffusion.notReady') }}</p>
      <p v-else-if="topic && !hasChannels">
        {{ t('diffusion.noAccount') }}
        <RouterLink
          :to="{ name: 'curation-settings', params: { topicId }, query: { tab: 'diffusion' } }"
          >{{ t('diffusion.configure') }}</RouterLink
        >
      </p>
      <div v-else class="row">
        <button
          v-if="toSchedule.length"
          type="button"
          class="button"
          data-variant="primary"
          :disabled="scheduling"
          @click="schedule('next_slot')"
        >
          {{ onlyFailed ? t('diffusion.retry') : t('diffusion.schedule') }}
        </button>
        <AlertDialogRoot v-if="toSchedule.length || canUnschedule">
          <AlertDialogTrigger as-child>
            <button type="button" class="button" :disabled="scheduling">
              {{ t('diffusion.publishNow') }}
            </button>
          </AlertDialogTrigger>
          <AlertDialogPortal>
            <AlertDialogOverlay class="dialog-overlay" />
            <AlertDialogContent class="dialog">
              <AlertDialogTitle class="dialog-title">
                {{ t('diffusion.confirmNowTitle') }}
              </AlertDialogTitle>
              <AlertDialogDescription>{{ t('diffusion.confirmNowText') }}</AlertDialogDescription>
              <div class="dialog-actions">
                <AlertDialogCancel class="button">{{ t('common.cancel') }}</AlertDialogCancel>
                <AlertDialogAction class="button" data-variant="primary" @click="schedule('now')">
                  {{ t('diffusion.publishNow') }}
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialogRoot>
        <button
          v-if="canUnschedule"
          type="button"
          class="button"
          :disabled="unscheduling"
          @click="unschedule()"
        >
          {{ t('diffusion.unschedule') }}
        </button>
      </div>
      <p role="status" :class="{ error: diffusionError }">{{ diffusionMessage }}</p>
    </section>
    <p v-else-if="detail.draft_status !== 'pending'" class="hint empty-note">
      {{ t('draft.empty') }}
    </p>
  </template>
</template>

<style scoped>
/* Drafting status: tone and icon follow the state (text first, color reinforces). */
.draft-state {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--space-2) var(--space-4);
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--color-border-subtle);
  border-inline-start: 6px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.draft-state[data-tone='accent'] {
  border-inline-start-color: var(--color-accent-fill);
}

.draft-state[data-tone='success'] {
  border-inline-start-color: var(--color-success);
}

.draft-state[data-tone='danger'] {
  border-inline-start-color: var(--color-danger);
}

.state-icon {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: var(--color-neutral-soft);
  color: var(--color-text);
}

.draft-state[data-tone='accent'] .state-icon {
  background: var(--color-accent-soft);
  color: var(--color-accent-text);
}

.draft-state[data-tone='success'] .state-icon {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.draft-state[data-tone='danger'] .state-icon {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.state-text h2 {
  margin: 0;
  font-size: 1.25rem;
}

.state-text p {
  margin: var(--space-1) 0 0;
}

/* "Draft again" at the far right, its help text under it. */
.state-action {
  display: grid;
  justify-items: end;
  gap: var(--space-1);
  max-width: 16rem;
  text-align: end;
}

.state-action .hint {
  margin: 0;
}

.state-message {
  grid-column: 2 / -1;
  margin: 0;
}

.state-message:empty {
  position: absolute;
}

/* No draft yet: a quiet line, centred and set apart from the status block. */
.empty-note {
  margin: var(--space-6) 0 0;
  text-align: center;
}

.confirm-text p {
  margin: 0 0 var(--space-2);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.spin {
  animation: spin 1s linear infinite;
}

/* Pasted source text: a full-width row under the status. */
.source-text {
  grid-column: 2 / -1;
}

.source-text summary {
  width: fit-content;
  min-height: 1.5rem;
  color: var(--color-accent-text);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
  cursor: pointer;
}

.source-text-form {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.source-text-form p {
  margin: 0;
}

.source-text-form textarea {
  width: 100%;
  resize: vertical;
}

.source-text-form .button {
  justify-self: start;
}

@media (max-width: 40rem) {
  .source-text {
    grid-column: 1 / -1;
  }

  .draft-state {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .state-action {
    grid-column: 1 / -1;
    justify-items: start;
    max-width: none;
    text-align: start;
  }
}

.kind-field {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.kind-field .field {
  min-height: 2.25rem;
  padding-block: var(--space-1);
  font-size: 0.875rem;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-4);
  padding: 0;
  list-style: none;
  color: var(--color-text-muted);
}

.block {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-6);
  padding: var(--space-5) var(--space-6);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.block h2,
.block h3,
.block p {
  margin: 0;
}

.block section {
  display: grid;
  gap: var(--space-4);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.pair {
  display: grid;
  gap: var(--space-5);
}

/* French and English side by side on wide screens, easier to compare. */
@media (min-width: 64rem) {
  .pair {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
}

.post {
  display: grid;
  gap: var(--space-2);
}

.signature {
  margin: 0;
  white-space: pre-line;
}

.signature span {
  display: block;
  font-weight: 600;
}

.post-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}

.excerpt {
  margin: 0;
}

blockquote {
  margin: var(--space-1) 0 0;
  padding-inline-start: var(--space-4);
  border-inline-start: 4px solid var(--color-accent-text);
  font-style: italic;
}
</style>
