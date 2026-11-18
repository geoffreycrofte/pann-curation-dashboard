<script setup lang="ts">
/**
 * A composed post (Création): what it is about, where its content comes from (the
 * person's notes, links they give, or sources Pann searches and they choose), their
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
} from '@pann/shared'
import { useQuery, useQueryCache } from '@pinia/colada'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import FirstCommentEditor from '../components/FirstCommentEditor.vue'
import TextSaver from '../components/TextSaver.vue'
import CompositionImages from '../components/compose/CompositionImages.vue'
import { api, type ComposeModeName, type ComposeSource, type Composition } from '../lib/api'
import { describeError } from '../lib/errors'
import { postWarnings } from '../lib/post-checks'
import { contentLangName } from '../lib/langs'
import { toast } from '../lib/toast'
import { useWorkspace } from '../lib/workspace'

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

// Content edited here, saved with "Save" (and before a search or a drafting) --------------
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
const dirty = computed(
  () =>
    !!form.value &&
    !!composition.value &&
    JSON.stringify(form.value) !== JSON.stringify(fromServer(composition.value)),
)
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

const saving = ref(false)
const message = ref('')
const isError = ref(false)
async function save(silent = false) {
  if (!form.value) return
  saving.value = true
  try {
    // Search results keep their text in the composition; only what changed is sent.
    await api.updateComposition(props.topicId, props.compositionId, form.value)
    await refetch()
    if (!silent) toast(t('common.saved'))
    isError.value = false
    message.value = ''
  } catch (err) {
    isError.value = true
    message.value = describeError((err as Error).message, t).text
    throw err
  } finally {
    saving.value = false
  }
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
  await save(true)
  await api.researchComposition(props.topicId, props.compositionId)
  await refetch()
}

async function draft() {
  if (dirty.value) await save(true)
  await api.draftComposition(props.topicId, props.compositionId)
  await refetch()
}

// Posts -----------------------------------------------------------------------------------
const posts = computed(() => composition.value?.posts ?? [])
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
async function schedule(when: 'next_slot' | 'now') {
  publishMessage.value = ''
  try {
    const result = await api.scheduleComposition(props.topicId, props.compositionId, when)
    publishError.value = false
    publishMessage.value =
      when === 'now'
        ? t('compose.publish.publishing')
        : t('compose.publish.scheduled', { date: formatDate(result.publish_at) })
    await refetch()
    await queryCache.invalidateQueries({ key: ['compositions', props.topicId] })
  } catch (err) {
    publishError.value = true
    publishMessage.value = describeError((err as Error).message, t).text
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
</script>

<template>
  <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <div v-else-if="composition && form" class="composition">
    <p>
      <RouterLink :to="{ name: 'compose', params: { topicId } }">{{
        t('compose.back')
      }}</RouterLink>
    </p>
    <h1 tabindex="-1">{{ composition.subject || t('compose.untitled') }}</h1>

    <!-- 1. What it is about, and where the content comes from -->
    <form class="block" novalidate @submit.prevent="save()">
      <h2>{{ t('compose.material') }}</h2>
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
        <legend>{{ t('compose.mode') }}</legend>
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
        <h3 :id="`${id}-links`">{{ t('compose.links.title') }}</h3>
        <ul v-if="form.sources.length" class="source-list">
          <li v-for="source in form.sources" :key="source.url">
            <a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}</a>
            <span class="url">{{ source.url }}</span>
            <button
              v-if="!readonly"
              type="button"
              class="button"
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
        <h3 :id="`${id}-search`">{{ t('compose.search.title') }}</h3>
        <p class="hint">{{ t('compose.search.hint') }}</p>
        <div v-if="!readonly">
          <button
            type="button"
            class="button"
            :disabled="composition.research_status === 'pending' || !form.subject.trim()"
            @click="research"
          >
            {{ form.sources.length ? t('compose.search.again') : t('compose.search.run') }}
          </button>
        </div>
        <p v-if="composition.research_status === 'pending'" role="status">
          {{ t('compose.search.running') }}
        </p>
        <p v-else-if="composition.research_status === 'failed'" class="error" role="alert">
          {{ describeError(composition.research_error ?? 'unexpected', t).text }}
        </p>
        <fieldset v-if="form.sources.length" class="results">
          <legend>{{ t('compose.search.choose') }}</legend>
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
          <button type="button" class="button" @click="form.link = chosen[0]!.url">
            {{ t('compose.useFirstSource') }}
          </button>
        </div>
      </div>

      <fieldset class="networks">
        <legend>{{ t('compose.networks') }}</legend>
        <p class="hint">{{ t('compose.networksHint') }}</p>
        <label v-for="channel in channels" :key="channel" class="choice">
          <input v-model="form.channels" type="checkbox" :value="channel" :disabled="readonly" />
          <span>{{ t(`draft.channels.${channel}`) }}</span>
        </label>
      </fieldset>

      <div v-if="!readonly" class="actions">
        <button type="submit" class="button" :disabled="saving || !dirty">
          {{ saving ? t('common.saving') : t('common.save') }}
        </button>
      </div>
      <p role="status" :class="{ error: isError }">{{ message }}</p>
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

    <!-- 3. Posts -->
    <section class="block" :aria-labelledby="`${id}-posts`">
      <h2 :id="`${id}-posts`">{{ t('compose.posts.title') }}</h2>
      <div v-if="!readonly" class="actions">
        <button
          type="button"
          class="button"
          data-variant="primary"
          :disabled="composition.draft_status === 'pending'"
          @click="draft"
        >
          {{ posts.length ? t('compose.posts.redraft') : t('compose.posts.draft') }}
        </button>
      </div>
      <p v-if="posts.length && !readonly" class="hint">{{ t('compose.posts.redraftHint') }}</p>
      <p v-if="composition.draft_status === 'pending'" role="status">
        {{ t('compose.posts.drafting') }}
      </p>
      <p v-else-if="composition.draft_status === 'failed'" class="error" role="alert">
        {{ describeError(composition.draft_error ?? 'unexpected', t).text }}
      </p>
      <section
        v-for="channel in postChannels"
        :key="channel"
        :aria-labelledby="`${id}-posts-${channel}`"
      >
        <h3 :id="`${id}-posts-${channel}`">{{ t(`draft.channels.${channel}`) }}</h3>
        <div class="pair">
          <div v-for="post in postsOf(channel)" :key="post.id" class="post">
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
            <p class="hint">
              {{ t(`diffusion.postStatus.${post.status}`) }}
              <template v-if="post.status === 'sent' && post.sent_at">
                , {{ t('diffusion.sentOn', { date: formatDate(post.sent_at) }) }}
              </template>
              <a
                v-if="post.published_url"
                :href="post.published_url"
                target="_blank"
                rel="noopener noreferrer"
                >{{ t('diffusion.view') }}</a
              >
            </p>
            <p v-if="post.last_error" class="error">{{ describeError(post.last_error, t).text }}</p>
          </div>
        </div>
      </section>
    </section>

    <!-- 4. Publication -->
    <section v-if="posts.length" class="block" :aria-labelledby="`${id}-publish`">
      <h2 :id="`${id}-publish`">{{ t('compose.publish.title') }}</h2>
      <p v-if="composition.status === 'scheduled' && composition.publish_at">
        {{ t('compose.publish.scheduled', { date: formatDate(composition.publish_at) }) }}
      </p>
      <p v-else-if="composition.status === 'published'">{{ t('compose.publish.published') }}</p>
      <p v-if="altMissing.length && !readonly" class="error">
        {{ t('compose.publish.altMissing', { langs: altMissing.join(', ') }) }}
      </p>
      <div v-if="!readonly" class="actions">
        <button
          type="button"
          class="button"
          data-variant="primary"
          :disabled="altMissing.length > 0"
          @click="schedule('next_slot')"
        >
          {{ t('compose.publish.nextSlot') }}
        </button>
        <button
          type="button"
          class="button"
          :disabled="altMissing.length > 0"
          @click="schedule('now')"
        >
          {{ t('compose.publish.now') }}
        </button>
        <button
          v-if="composition.status === 'scheduled'"
          type="button"
          class="button"
          @click="unschedule"
        >
          {{ t('compose.publish.unschedule') }}
        </button>
      </div>
      <p role="status" :class="{ error: publishError }">{{ publishMessage }}</p>
    </section>

    <div v-if="composition.status === 'draft'" class="block">
      <button type="button" class="button" data-variant="danger" @click="remove">
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

.composition h1,
.composition > p {
  margin: 0;
}

.block {
  display: grid;
  gap: var(--space-4);
  padding-top: var(--space-5);
  border-top: 1px solid var(--color-border-subtle);
}

.block h2,
.block h3 {
  margin: 0;
}

.block > .button {
  justify-self: start;
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

.result p {
  margin: var(--space-1) 0;
}

.sources {
  display: grid;
  gap: var(--space-3);
}

.source-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.source-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
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

.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
  gap: var(--space-4);
  align-items: start;
}

.post {
  display: grid;
  gap: var(--space-2);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
</style>
