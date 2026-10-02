<script setup lang="ts">
import {
  accountFor,
  DRAFT_CHANNELS,
  LANGS,
  POST_LIMITS,
  publishedLength,
  type DraftChannel,
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
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TextSaver from '../components/TextSaver.vue'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { useWorkspace } from '../lib/workspace'

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
  },
  onError: diffusionFailed,
})

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
      <li>{{ t(`statusOne.${detail.status}`) }}</li>
      <li v-if="detail.item.kind">{{ t(`kind.${detail.item.kind}`) }}</li>
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

    <section class="block" aria-labelledby="drafting-status">
      <h2 id="drafting-status">{{ t(`draft.status.${detail.draft_status}`) }}</h2>
      <p v-if="detail.draft_error" class="error">{{ describeError(detail.draft_error, t).text }}</p>
      <p v-if="detail.draft_error && describeError(detail.draft_error, t).provider">
        <RouterLink to="/connections">{{ t('errors.fixInConnections') }}</RouterLink>
      </p>
      <p v-if="!canDraft" class="hint">{{ t('draft.notValidated') }}</p>
      <p v-if="model" class="hint">{{ t('draft.model', { model }) }}</p>
      <div v-if="canDraft" class="row">
        <button
          type="button"
          class="button"
          :disabled="regenerating || detail.draft_status === 'pending'"
          aria-describedby="regenerate-hint"
          @click="regenerate()"
        >
          {{ t('draft.regenerate') }}
        </button>
        <p id="regenerate-hint" class="hint">{{ t('draft.regenerateHint') }}</p>
      </div>
      <p role="status" :class="{ error: isError }">{{ message }}</p>
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
            :save="(text) => saveSummary(lang, text)"
          />
        </template>
      </div>
    </section>

    <section v-if="detail.posts.length" class="block" aria-labelledby="posts">
      <h2 id="posts">{{ t('draft.posts') }}</h2>
      <section
        v-for="channel in DRAFT_CHANNELS"
        :key="channel"
        :aria-labelledby="`posts-${channel}`"
      >
        <h3 :id="`posts-${channel}`">{{ t(`draft.channels.${channel}`) }}</h3>
        <div class="pair">
          <div
            v-for="post in detail.posts.filter((p) => p.channel === channel)"
            :key="post.id"
            class="post"
          >
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
              :measure="(text) => publishedLength(channel, text, url)"
              length-key="diffusion.lengthWithLink"
              :readonly="post.status === 'sent' || !!post.claimed_at"
              :edited="post.edited_by_human"
              :save="(text) => savePost(post.id, text)"
            />
            <p class="post-status" :data-status="post.status">
              <span class="badge">{{
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
        <RouterLink :to="{ name: 'settings', params: { topicId } }">{{
          t('diffusion.configure')
        }}</RouterLink>
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
    <p v-else-if="detail.draft_status !== 'pending'" class="hint">{{ t('draft.empty') }}</p>
  </template>
</template>

<style scoped>
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

.post-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}

.badge {
  padding: 0.125rem var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  font-size: 0.8125rem;
  font-weight: 650;
}

.post-status[data-status='sent'] .badge {
  border-color: var(--color-success);
  color: var(--color-success);
}

.post-status[data-status='failed'] .badge {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.post-status[data-status='scheduled'] .badge {
  border-color: var(--color-accent-fill);
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
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
