<script setup lang="ts">
/**
 * A composed post (Création): what it is about, where its content comes from (the
 * person's notes, links they give, or sources Glimr searches and they choose), their
 * images with text alternatives, then one post per network and language to edit and
 * schedule on the Création slots. Drafting and search run as jobs: the page polls.
 */
import {
  draftChannels,
  missingAlt,
  POST_LIMITS,
  postSignature,
  publishedLength,
  type DraftChannel,
  type PostDraft,
} from '@glimr/shared'
import { useQuery, useQueryCache } from '@pinia/colada'
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
import { useRouter } from 'vue-router'
import AutosaveStatus from '../components/AutosaveStatus.vue'
import FirstCommentEditor from '../components/FirstCommentEditor.vue'
import Icon from '../components/Icon.vue'
import QuickPublish from '../components/QuickPublish.vue'
import TextSaver from '../components/TextSaver.vue'
import CompositionImages from '../components/compose/CompositionImages.vue'
import { useAutosave } from '../lib/autosave'
import { api, type ComposeModeName, type ComposeSource, type Composition } from '../lib/api'
import { describeError } from '../lib/errors'
import { postWarnings } from '../lib/post-checks'
import { contentLangName } from '../lib/langs'
import { toast } from '../lib/toast'
import { useWorkspace } from '../lib/workspace'
import { usePageDetail } from '../lib/page-title'

const props = defineProps<{ topicId: string; compositionId: string }>()
const { t, d } = useI18n()
const id = useId()
const router = useRouter()
const queryCache = useQueryCache()
const { workspaceId } = useWorkspace()
const key = () => ['composition', props.topicId, props.compositionId]

const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const {
  data: composition,
  isPending,
  error,
  refetch,
} = useQuery({
  key,
  query: () => api.composition(props.topicId, props.compositionId),
})
const { data: credentials } = useQuery({
  key: () => ['credentials', workspaceId.value ?? ''],
  query: () => api.credentials(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})

// Jobs (search, drafting, text alternatives) are followed by polling the composition.
const busy = computed(
  () =>
    composition.value?.draft_status === 'pending' ||
    composition.value?.research_status === 'pending' ||
    !!composition.value?.media.some((m) => m.alt_status === 'pending'),
)
let poll: ReturnType<typeof setTimeout> | undefined
watch(
  [busy, composition],
  () => {
    clearTimeout(poll)
    if (busy.value) poll = setTimeout(() => void refetch(), 1500)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(poll))

// Content edited here, saved by itself (and before a search or a drafting) ----------------
interface Form {
  subject: string
  mode: ComposeModeName
  notes: string
  link: string
  sources: ComposeSource[]
  channels: DraftChannel[]
}
const form = ref<Form | null>(null)
const fromServer = (c: Composition): Form => ({
  subject: c.subject,
  mode: c.mode,
  notes: c.notes,
  link: c.link,
  sources: c.sources.map((s) => ({ ...s })),
  channels: [...c.channels],
})
const autosave = useAutosave({
  value: () => form.value,
  stored: () => (composition.value ? fromServer(composition.value) : null),
  valid: () => !!form.value && !!composition.value,
  save: async (value) => {
    // Search results keep their text in the composition; only what changed is sent.
    await api.updateComposition(props.topicId, props.compositionId, value!)
    await refetch()
  },
})
const dirty = autosave.dirty
watch(
  composition,
  (value) => {
    // New search results or texts read by a job come in, unless the person is editing.
    if (value && (!form.value || !dirty.value)) form.value = fromServer(value)
  },
  { immediate: true },
)

const readonly = computed(() => composition.value?.status === 'published')
const channels = computed<DraftChannel[]>(() =>
  topic.value ? draftChannels(topic.value.config) : [],
)
const langs = computed(() => topic.value?.config.output_langs ?? [])
const chosen = computed(() => form.value?.sources.filter((s) => s.selected) ?? [])

/** Saves what is being edited now; fails when the save fails. */
async function save() {
  await autosave.flush()
  if (autosave.state.value === 'error') throw autosave.error.value
}

// Links (mode "links") --------------------------------------------------------------------
const newLink = ref('')
const linkError = ref('')
function addLink() {
  linkError.value = ''
  let url: URL
  try {
    url = new URL(newLink.value.trim())
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol')
  } catch {
    linkError.value = t('compose.links.invalid')
    return
  }
  if (form.value!.sources.some((s) => s.url === url.href)) {
    linkError.value = t('compose.links.duplicate')
    return
  }
  form.value!.sources.push({ url: url.href, title: url.hostname, selected: true })
  newLink.value = ''
}
function removeSource(url: string) {
  form.value!.sources = form.value!.sources.filter((s) => s.url !== url)
}

async function research() {
  await save()
  await api.researchComposition(props.topicId, props.compositionId)
  await refetch()
}

async function draft() {
  await save()
  await api.draftComposition(props.topicId, props.compositionId)
  await refetch()
}

// Posts -----------------------------------------------------------------------------------
const posts = computed(() => composition.value?.posts ?? [])
/** The material is open until posts exist, then folds (the person can open it again). */
const materialOpen = ref(true)
watch(
  () => posts.value.length > 0,
  (hasPosts) => {
    materialOpen.value = !hasPosts
  },
  { immediate: true },
)
const postChannels = computed(() => [...new Set(posts.value.map((p) => p.channel))])
const postsOf = (channel: DraftChannel) => posts.value.filter((p) => p.channel === channel)
const mastodonLimit = computed(
  () =>
    credentials.value?.find((c) => c.provider === 'mastodon')?.meta.max_characters ??
    POST_LIMITS.mastodon,
)
const limitOf = (channel: DraftChannel) =>
  channel === 'mastodon' ? mastodonLimit.value : POST_LIMITS[channel]
const postChecks = computed(() => postWarnings(topic.value?.config, t))
const signatureOf = (post: PostDraft) =>
  topic.value && post.lang ? postSignature(topic.value.config, post.channel, post.lang) : ''
const defaultCommentOf = (post: PostDraft) =>
  (topic.value && post.lang ? topic.value.config.linkedin.first_comment[post.lang] : '') ?? ''
const link = computed(() => composition.value?.link ?? '')

async function savePost(postId: string, text: string) {
  await api.updatePost(props.topicId, postId, text)
  await queryCache.invalidateQueries({ key: key() })
}
async function saveFirstComment(postId: string, value: string | null) {
  await api.updateFirstComment(props.topicId, postId, value)
  await queryCache.invalidateQueries({ key: key() })
}

// Publication -----------------------------------------------------------------------------
const formatDate = (value: string) =>
  d(new Date(value), {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: topic.value?.config.schedule.timezone,
  })
const altMissing = computed(() =>
  missingAlt(composition.value?.media ?? [], langs.value).map((l) => contentLangName(l)),
)
const publishMessage = ref('')
const publishError = ref(false)
const publishing = ref(false)
/** Publication section and its heading: the floating island hides over the one, focuses the other. */
const publishSection = ref<HTMLElement | null>(null)
const publishHeading = ref<HTMLElement | null>(null)
async function schedule(when: 'next_slot' | 'now', fromIsland = false) {
  publishMessage.value = ''
  publishing.value = true
  try {
    const result = await api.scheduleComposition(props.topicId, props.compositionId, when)
    publishError.value = false
    publishMessage.value =
      when === 'now'
        ? t('compose.publish.publishing')
        : t('compose.publish.scheduled', { date: formatDate(result.publish_at) })
    // Asked from the floating island: the outcome is far below, a toast shows it too.
    if (fromIsland) toast(publishMessage.value)
    await refetch()
    await queryCache.invalidateQueries({ key: ['compositions', props.topicId] })
  } catch (err) {
    publishError.value = true
    publishMessage.value = describeError((err as Error).message, t).text
    // From the island: bring the error into view, with its context.
    if (fromIsland) publishHeading.value?.scrollIntoView({ block: 'start' })
  } finally {
    publishing.value = false
  }
}
async function unschedule() {
  await api.unscheduleComposition(props.topicId, props.compositionId)
  publishError.value = false
  publishMessage.value = t('compose.publish.unscheduled')
  await refetch()
}

async function remove() {
  if (!window.confirm(t('compose.deleteConfirm'))) return
  await api.deleteComposition(props.topicId, props.compositionId)
  await queryCache.invalidateQueries({ key: ['compositions', props.topicId] })
  toast(t('compose.deleted'))
  await router.push({ name: 'compose', params: { topicId: props.topicId } })
}

// Where the composition and its posts stand: the tone reinforces the text, never alone.
const stateTone = computed(
  () =>
    ({ draft: undefined, scheduled: 'accent', published: 'success' })[
      composition.value?.status ?? 'draft'
    ],
)
const draftState = computed(() => {
  const status = composition.value?.draft_status
  if (status === 'pending' || status === 'failed') return status
  return posts.value.length ? 'ready' : 'none'
})
const draftTone = computed(
  () =>
    ({ none: 'neutral', pending: 'accent', ready: 'success', failed: 'danger' })[draftState.value],
)
const postTone = (post: PostDraft) =>
  post.status === 'sent'
    ? 'success'
    : post.status === 'failed'
      ? 'danger'
      : post.status === 'scheduled' || post.claimed_at
        ? 'accent'
        : undefined

// The document title starts with what this page shows.
usePageDetail(() =>
  composition.value ? composition.value.subject || t('compose.untitled') : undefined,
)
</script>

<template>
  <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <div v-else-if="composition && form" class="composition">
    <!-- Header: back, the subject, then where the post stands at a glance. -->
    <header class="head">
      <p>
        <RouterLink :to="{ name: 'compose', params: { topicId } }">{{
          t('compose.back')
        }}</RouterLink>
      </p>
      <h1 tabindex="-1">{{ composition.subject || t('compose.untitled') }}</h1>
      <ul class="meta">
        <li>
          <span class="badge" data-dot :data-tone="stateTone">
            {{ t(`compose.state.${composition.status}`) }}
          </span>
        </li>
        <li v-if="composition.status === 'scheduled' && composition.publish_at" class="date">
          {{ t('compose.publish.scheduled', { date: formatDate(composition.publish_at) }) }}
        </li>
        <li class="date">
          {{
            t('compose.updatedOn', {
              date: d(new Date(composition.updated_at), { dateStyle: 'medium' }),
            })
          }}
        </li>
        <!-- Said once for the page; each field shows its own state beside its label. -->
        <li v-if="!readonly" class="date">{{ t('autosave.auto') }}</li>
      </ul>
    </header>

    <!-- 1. What it is about, and where the content comes from -->
    <form
      class="block"
      novalidate
      :aria-labelledby="`${id}-material`"
      @submit.prevent="autosave.flush()"
    >
      <!-- Once posts exist, the material folds to one line: the posts come first. -->
      <div class="material-head">
        <div class="material-title">
          <h2 :id="`${id}-material`">{{ t('compose.material') }}</h2>
          <AutosaveStatus
            v-if="!readonly"
            :state="autosave.state.value"
            :error="autosave.error.value"
          />
        </div>
        <button
          v-if="posts.length"
          type="button"
          class="button toggle"
          data-size="small"
          :aria-expanded="materialOpen"
          :aria-controls="`${id}-material-fields`"
          @click="materialOpen = !materialOpen"
        >
          {{ t('compose.editMaterial') }}
          <svg class="chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
      </div>
      <p v-if="!materialOpen" class="hint material-summary">
        <span>{{ form.subject || t('compose.untitled') }}</span>
        <span>{{ t(`compose.modes.${form.mode}`) }}</span>
        <span v-if="form.channels.length">
          {{ form.channels.map((c) => t(`draft.channels.${c}`)).join(', ') }}
        </span>
      </p>
      <div v-show="materialOpen" :id="`${id}-material-fields`" class="material-fields">
        <div class="form-row">
          <label :for="`${id}-subject`">{{ t('compose.subject') }}</label>
          <input
            :id="`${id}-subject`"
            v-model="form.subject"
            class="field"
            type="text"
            maxlength="300"
            :readonly="readonly"
            :aria-describedby="`${id}-subject-hint`"
          />
          <p :id="`${id}-subject-hint`" class="hint">{{ t('compose.subjectHint') }}</p>
        </div>

        <fieldset class="modes">
          <legend class="form-label">{{ t('compose.mode') }}</legend>
          <label v-for="mode in ['notes', 'links', 'search'] as const" :key="mode" class="choice">
            <input v-model="form.mode" type="radio" :value="mode" :disabled="readonly" />
            <span>
              <strong>{{ t(`compose.modes.${mode}`) }}</strong>
              <span class="hint">{{ t(`compose.modes.${mode}Hint`) }}</span>
            </span>
          </label>
        </fieldset>

        <div class="form-row">
          <label :for="`${id}-notes`">
            {{ form.mode === 'notes' ? t('compose.notes') : t('compose.notesOptional') }}
          </label>
          <textarea
            :id="`${id}-notes`"
            v-model="form.notes"
            class="field"
            rows="6"
            maxlength="10000"
            :readonly="readonly"
            :aria-describedby="`${id}-notes-hint`"
          ></textarea>
          <p :id="`${id}-notes-hint`" class="hint">{{ t(`compose.notesHint.${form.mode}`) }}</p>
        </div>

        <!-- Links given by the person -->
        <section v-if="form.mode === 'links'" class="sources" :aria-labelledby="`${id}-links`">
          <h3 :id="`${id}-links`" class="form-label">{{ t('compose.links.title') }}</h3>
          <ul v-if="form.sources.length" class="source-list">
            <li v-for="source in form.sources" :key="source.url">
              <span class="source-text">
                <a :href="source.url" target="_blank" rel="noopener noreferrer">{{
                  source.title
                }}</a>
                <span class="url">{{ source.url }}</span>
              </span>
              <button
                v-if="!readonly"
                type="button"
                class="button"
                data-size="small"
                data-variant="danger"
                :aria-label="t('compose.links.removeLabel', { title: source.title })"
                @click="removeSource(source.url)"
              >
                {{ t('compose.links.remove') }}
              </button>
            </li>
          </ul>
          <div v-if="!readonly" class="form-row">
            <label :for="`${id}-new-link`">{{ t('compose.links.add') }}</label>
            <div class="inline">
              <input
                :id="`${id}-new-link`"
                v-model="newLink"
                class="field"
                type="url"
                inputmode="url"
                placeholder="https://"
                :aria-invalid="!!linkError || undefined"
                :aria-describedby="linkError ? `${id}-link-error` : undefined"
                @keydown.enter.prevent="addLink"
              />
              <button type="button" class="button" @click="addLink">
                {{ t('compose.links.addButton') }}
              </button>
            </div>
            <p v-if="linkError" :id="`${id}-link-error`" class="error" role="alert">
              {{ linkError }}
            </p>
          </div>
        </section>

        <!-- Sources found by a search, to choose from -->
        <section v-if="form.mode === 'search'" class="sources" :aria-labelledby="`${id}-search`">
          <h3 :id="`${id}-search`" class="form-label">{{ t('compose.search.title') }}</h3>
          <p class="hint">{{ t('compose.search.hint') }}</p>
          <div v-if="!readonly">
            <button
              type="button"
              class="button"
              data-size="small"
              :disabled="composition.research_status === 'pending' || !form.subject.trim()"
              @click="research"
            >
              <Icon name="search" />
              {{ form.sources.length ? t('compose.search.again') : t('compose.search.run') }}
            </button>
          </div>
          <p v-if="composition.research_status === 'pending'" role="status">
            {{ t('compose.search.running') }}
          </p>
          <p
            v-else-if="composition.research_status === 'failed'"
            class="notice notice-inline"
            data-tone="danger"
            role="alert"
          >
            <Icon name="alert-circle" />
            <span>{{ describeError(composition.research_error ?? 'unexpected', t).text }}</span>
          </p>
          <fieldset v-if="form.sources.length" class="results">
            <legend class="visually-hidden">{{ t('compose.search.choose') }}</legend>
            <div v-for="(source, index) in form.sources" :key="source.url" class="result">
              <input
                :id="`${id}-source-${index}`"
                v-model="source.selected"
                type="checkbox"
                :disabled="readonly"
                :aria-describedby="`${id}-source-${index}-excerpt`"
              />
              <div>
                <label :for="`${id}-source-${index}`">{{ source.title }}</label>
                <p :id="`${id}-source-${index}-excerpt`" class="hint">
                  {{ source.excerpt }}
                </p>
                <a :href="source.url" target="_blank" rel="noopener noreferrer" class="url">
                  {{ t('compose.search.open') }}
                  <span class="visually-hidden">{{ source.title }}</span>
                </a>
              </div>
            </div>
          </fieldset>
        </section>

        <div class="form-row">
          <label :for="`${id}-link`">{{ t('compose.link') }}</label>
          <input
            :id="`${id}-link`"
            v-model="form.link"
            class="field"
            type="url"
            inputmode="url"
            placeholder="https://"
            :readonly="readonly"
            :aria-describedby="`${id}-link-hint`"
          />
          <p :id="`${id}-link-hint`" class="hint">{{ t('compose.linkHint') }}</p>
          <div v-if="!readonly && chosen.length && form.link !== chosen[0]!.url">
            <button
              type="button"
              class="button"
              data-size="small"
              @click="form.link = chosen[0]!.url"
            >
              {{ t('compose.useFirstSource') }}
            </button>
          </div>
        </div>

        <fieldset class="networks" :aria-describedby="`${id}-networks-hint`">
          <legend class="form-label">{{ t('compose.networks') }}</legend>
          <div class="network-choices">
            <label v-for="channel in channels" :key="channel" class="choice">
              <input
                v-model="form.channels"
                type="checkbox"
                :value="channel"
                :disabled="readonly"
              />
              <span
                ><Icon :name="channel" class="network-logo" />{{
                  t(`draft.channels.${channel}`)
                }}</span
              >
            </label>
          </div>
          <p :id="`${id}-networks-hint`" class="hint">{{ t('compose.networksHint') }}</p>
        </fieldset>
      </div>
    </form>

    <!-- 2. Images -->
    <div class="block">
      <CompositionImages
        :topic-id="topicId"
        :composition-id="compositionId"
        :media="composition.media"
        :langs="langs"
        :readonly="readonly"
        @changed="refetch()"
      />
    </div>

    <!-- 3. The drafting: a compact status card, its action on the right. -->
    <section class="block draft-state" :data-tone="draftTone" :aria-labelledby="`${id}-drafting`">
      <span class="state-icon" aria-hidden="true">
        <svg v-if="draftState === 'ready'" viewBox="0 0 24 24" width="18" height="18">
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
          v-else-if="draftState === 'pending'"
          class="spin"
          viewBox="0 0 24 24"
          width="18"
          height="18"
        >
          <path
            d="M12 3a9 9 0 1 1-9 9"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
          />
        </svg>
        <svg v-else-if="draftState === 'failed'" viewBox="0 0 24 24" width="18" height="18">
          <path
            d="M12 7v6M12 16.5v.5"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
          />
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="18" height="18">
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
        <h2 :id="`${id}-drafting`">{{ t(`compose.posts.status.${draftState}`) }}</h2>
      </div>
      <!-- No posts yet: writing them is the step of the page (gold). Afterwards, secondary. -->
      <div v-if="!readonly" class="state-action">
        <button
          type="button"
          class="button"
          :data-variant="posts.length ? undefined : 'primary'"
          :data-size="posts.length ? 'small' : undefined"
          :disabled="composition.draft_status === 'pending'"
          :aria-describedby="`${id}-drafting-hint`"
          @click="draft"
        >
          <Icon name="sparkles" />
          {{ posts.length ? t('compose.posts.redraft') : t('compose.posts.draft') }}
        </button>
      </div>
      <div class="state-more">
        <p
          v-if="composition.draft_status === 'failed'"
          class="notice notice-inline"
          data-tone="danger"
          role="alert"
        >
          <Icon name="alert-circle" />
          <span>{{ describeError(composition.draft_error ?? 'unexpected', t).text }}</span>
        </p>
        <p v-if="!readonly" :id="`${id}-drafting-hint`" class="hint">
          {{ posts.length ? t('compose.posts.redraftHint') : t('compose.posts.firstHint') }}
        </p>
      </div>
      <p v-if="composition.draft_status === 'pending'" role="status" class="visually-hidden">
        {{ t('compose.posts.drafting') }}
      </p>
    </section>

    <!-- 4. Publication: the next step once posts exist, marked by the gold edge. -->
    <section
      v-if="posts.length"
      ref="publishSection"
      class="block"
      :class="{ 'next-step': !readonly }"
      :aria-labelledby="`${id}-publish`"
    >
      <h2 :id="`${id}-publish`" ref="publishHeading" tabindex="-1">
        {{ t('compose.publish.title') }}
      </h2>
      <p v-if="!readonly" class="hint">{{ t('compose.publish.intro') }}</p>
      <p v-if="composition.status === 'scheduled' && composition.publish_at">
        {{ t('compose.publish.scheduled', { date: formatDate(composition.publish_at) }) }}
      </p>
      <p v-else-if="composition.status === 'published'">{{ t('compose.publish.published') }}</p>
      <p v-if="altMissing.length && !readonly" class="notice notice-inline" data-tone="danger">
        <Icon name="alert-circle" />
        <span>{{ t('compose.publish.altMissing', { langs: altMissing.join(', ') }) }}</span>
      </p>
      <div v-if="!readonly" class="actions">
        <button
          type="button"
          class="button"
          data-variant="primary"
          :disabled="altMissing.length > 0"
          @click="schedule('next_slot')"
        >
          <Icon name="clock" />
          {{ t('compose.publish.nextSlot') }}
        </button>
        <!-- Cannot be undone from Glimr: confirmed first, as in the item page. -->
        <AlertDialogRoot>
          <AlertDialogTrigger as-child>
            <button type="button" class="button" :disabled="altMissing.length > 0 || publishing">
              <Icon name="send" />
              {{ t('compose.publish.now') }}
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
                  {{ t('compose.publish.now') }}
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialogRoot>
        <button
          v-if="composition.status === 'scheduled'"
          type="button"
          class="button"
          @click="unschedule"
        >
          {{ t('compose.publish.unschedule') }}
        </button>
      </div>
      <p role="status" class="message" :class="{ error: publishError }">{{ publishMessage }}</p>
    </section>

    <!-- 5. Posts: one network after another, each post's state before its text. -->
    <section v-if="posts.length" class="block" :aria-labelledby="`${id}-posts`">
      <h2 :id="`${id}-posts`">{{ t('compose.posts.title') }}</h2>
      <section
        v-for="channel in postChannels"
        :key="channel"
        class="network"
        :aria-labelledby="`${id}-posts-${channel}`"
      >
        <h3 :id="`${id}-posts-${channel}`">
          <Icon :name="channel" :size="20" class="network-logo" />{{
            t(`draft.channels.${channel}`)
          }}
        </h3>
        <div class="pair">
          <div v-for="post in postsOf(channel)" :key="post.id" class="post">
            <p class="post-status">
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
                    lang: contentLangName(post.lang),
                  })
                "
                >{{ t('diffusion.view') }}</a
              >
            </p>
            <p
              v-if="post.last_error && post.status !== 'sent'"
              class="notice notice-inline"
              data-tone="danger"
            >
              <Icon name="alert-circle" />
              <span>
                {{ describeError(post.last_error, t).text }}
                <RouterLink v-if="describeError(post.last_error, t).provider" to="/connections">
                  {{ t('errors.fixInConnections') }}
                </RouterLink>
              </span>
            </p>
            <TextSaver
              :label="
                t('draft.postLabel', {
                  channel: t(`draft.channels.${channel}`),
                  lang: contentLangName(post.lang),
                })
              "
              :value="post.body"
              :lang="post.lang ?? undefined"
              :limit="limitOf(channel)"
              :limit-name="t(`draft.channels.${channel}`)"
              :measure="(text) => publishedLength(channel, text, link, signatureOf(post))"
              :length-key="link ? 'diffusion.lengthWithLink' : undefined"
              :readonly="post.status === 'sent' || !!post.claimed_at"
              :edited="post.edited_by_human"
              :checks="postChecks"
              :save="(text) => savePost(post.id, text)"
            />
            <FirstCommentEditor
              v-if="channel === 'linkedin'"
              :value="post.first_comment"
              :default-text="defaultCommentOf(post)"
              :lang="post.lang ?? undefined"
              :readonly="post.status === 'sent' || !!post.claimed_at"
              :save="(value) => saveFirstComment(post.id, value)"
            />
          </div>
        </div>
      </section>
    </section>

    <QuickPublish
      v-if="posts.length && !readonly && !altMissing.length"
      :can-schedule="composition.status !== 'scheduled'"
      :retry="false"
      :can-publish-now="true"
      :busy="publishing"
      :target="publishSection"
      :fallback-focus="publishHeading"
      @confirm="(when) => schedule(when, true)"
    />

    <!-- Deleting comes last, small and apart from the rest. -->
    <div v-if="composition.status === 'draft'" class="end">
      <button type="button" class="button" data-size="small" data-variant="danger" @click="remove">
        <Icon name="trash" />
        {{ t('compose.delete') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.composition {
  display: grid;
  gap: var(--space-6);
  max-width: 52rem;
}

.composition p {
  margin: 0;
}

/* Header: back, title, then the state line, close together. */
.head {
  display: grid;
  gap: var(--space-3);
}

.head h1 {
  margin: 0;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--color-text-muted);
}

.meta .date {
  font-size: 0.875rem;
}

/* Every step is a card, the title inside, like the item page. */
.block {
  display: grid;
  gap: var(--space-5);
  min-width: 0;
  padding: var(--space-5) var(--space-6);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.block h2,
.block h3 {
  margin: 0;
}

/* Publication, the next step once the posts are written: the gold edge marks it. */
.block.next-step {
  gap: var(--space-4);
  border-inline-start: 6px solid var(--color-accent-fill);
}

/* An intro right under its title: closer than what follows. */
.block > h2 + .hint {
  margin-top: calc(-1 * var(--space-2));
}

.modes,
.networks,
.results {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
}

.modes legend,
.networks legend {
  float: left;
  width: 100%;
  padding: 0;
  font-family: inherit;
  font-size: 1rem;
}

.choice,
.result {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-height: 2.75rem;
  padding: var(--space-2) 0;
}

.choice input,
.result input {
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

/* The networks fit on one line: checkboxes side by side, the hint under them. */
.network-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-6);
}

.network-choices .choice {
  padding-block: var(--space-1);
  min-height: 2.25rem;
}

.result p {
  margin: var(--space-1) 0;
}

.sources {
  display: grid;
  gap: var(--space-2);
}

.sources > h3 {
  font-family: inherit;
  font-size: 1rem;
}

/* Given links: a bordered list, "Remove" small and red at the end of each row. */
.source-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
}

.source-list li {
  display: flex;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2) var(--space-3);
}

.source-list li + li {
  border-top: 1px solid var(--color-border-subtle);
}

.source-text {
  display: grid;
  flex: 1;
  min-width: 0;
}

.url {
  color: var(--color-text-muted);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.inline {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.inline .field {
  flex: 1 1 16rem;
}

.field {
  width: 100%;
}

textarea.field {
  resize: vertical;
}

/* Empty live regions: kept for announcements, out of the layout. */
.section-actions p:empty,
.message:empty {
  position: absolute;
}

/* Drafting status: tone and icon follow the state (text first, color reinforces). */
.block.draft-state {
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3) var(--space-5);
  border-inline-start: 6px solid var(--color-border);
  box-shadow: none;
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
  width: 2rem;
  height: 2rem;
  margin-top: 0.125rem;
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
  display: flex;
  align-items: center;
  /* As tall as the icon and the button: the three line up. */
  min-height: 2.25rem;
  font-size: 1.125rem;
  line-height: 1.3;
}

.state-more {
  display: grid;
  gap: var(--space-1);
  grid-column: 2 / -1;
}

.state-more:empty {
  display: none;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.spin {
  animation: spin 1s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}

/* Networks one after another: a rule and more space than between a network's posts. */
.network {
  display: grid;
  gap: var(--space-4);
}

.network + .network {
  padding-top: var(--space-5);
  border-top: 1px solid var(--color-border-subtle);
}

.network h3 {
  font-size: 1.125rem;
}

.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
  gap: var(--space-5);
  align-items: start;
}

.post {
  display: grid;
  align-content: start;
  gap: var(--space-2);
}

.post-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  font-size: 0.875rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.end {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 40rem) {
  .block {
    padding: var(--space-4);
  }

  .block.draft-state {
    grid-template-columns: auto minmax(0, 1fr);
    padding: var(--space-3) var(--space-4);
  }

  .state-action,
  .state-more {
    grid-column: 1 / -1;
  }
}
/* The material: title and its fold button on one row, the summary right under. */
.material-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
}

.material-head h2 {
  margin: 0;
}

.material-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.material-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-4);
  margin: 0;
}

/* Separators only between parts, silent for screen readers. */
.material-summary span + span::before {
  content: '•' / '';
  margin-inline-end: var(--space-4);
}

.material-fields {
  display: grid;
  gap: inherit;
}

.toggle .chevron {
  transition: transform 0.15s ease;
}

.toggle[aria-expanded='true'] .chevron {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .toggle .chevron {
    transition: none;
  }
}
</style>
