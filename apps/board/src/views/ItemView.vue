<script setup lang="ts">
import { DRAFT_CHANNELS, LANGS, POST_LIMITS } from '@pann/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TextSaver from '../components/TextSaver.vue'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'

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

// While drafting runs, refresh every 3 s.
let poller: ReturnType<typeof setInterval> | undefined
watch(
  () => detail.value?.draft_status,
  (status) => {
    if (status === 'pending' && !poller) {
      poller = setInterval(() => queryCache.invalidateQueries({ key: key() }), 3000)
    } else if (status !== 'pending' && poller) {
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
    </section>

    <section v-if="detail.posts.length" class="block" aria-labelledby="posts">
      <h2 id="posts">{{ t('draft.posts') }}</h2>
      <section
        v-for="channel in DRAFT_CHANNELS"
        :key="channel"
        :aria-labelledby="`posts-${channel}`"
      >
        <h3 :id="`posts-${channel}`">{{ t(`draft.channels.${channel}`) }}</h3>
        <template v-for="post in detail.posts.filter((p) => p.channel === channel)" :key="post.id">
          <TextSaver
            :label="
              t('draft.postLabel', {
                channel: t(`draft.channels.${channel}`),
                lang: t(`draft.langs.${post.lang}`),
              })
            "
            :value="post.body"
            :lang="post.lang ?? undefined"
            :limit="POST_LIMITS[channel]"
            :limit-name="t(`draft.channels.${channel}`)"
            :edited="post.edited_by_human"
            :save="(text) => savePost(post.id, text)"
          />
        </template>
      </section>
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
  padding: var(--space-4) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
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
