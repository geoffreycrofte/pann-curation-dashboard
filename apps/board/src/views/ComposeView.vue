<script setup lang="ts">
/** Création tool of a topic: the posts written by the person, by state. */
import { useQuery } from '@pinia/colada'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import ComposeFromIdea from '../components/compose/ComposeFromIdea.vue'
import ContentCard from '../components/ContentCard.vue'
import Icon from '../components/Icon.vue'
import { api, type CompositionSummary } from '../lib/api'
import { describeError } from '../lib/errors'
import { useTopicName } from '../lib/topic-name'

const props = defineProps<{ topicId: string }>()
const { t, d } = useI18n()
const router = useRouter()
const topicName = useTopicName(() => props.topicId)

const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const {
  data: compositions,
  isPending,
  error,
} = useQuery({
  key: () => ['compositions', props.topicId],
  query: () => api.compositions(props.topicId),
})

// Ideas from the other tools: what was kept in the news watch and the conversations.
const { data: kept } = useQuery({
  key: () => ['items', props.topicId, 'validated'],
  query: () => api.items(props.topicId, 'validated'),
  enabled: () => !!topic.value?.config.modules.curation,
})
const { data: answered } = useQuery({
  key: () => ['conversations', props.topicId, 'validated'],
  query: () => api.conversations(props.topicId, 'validated'),
  enabled: () => !!topic.value?.config.modules.engagement,
})
/** Not already the source of a composition. */
const used = computed(() => new Set((compositions.value ?? []).map((c) => c.subject)))
const ideas = computed(() => [
  ...(kept.value ?? [])
    .filter((i) => !used.value.has(i.title))
    .slice(0, 5)
    .map((i) => ({
      key: i.item_id,
      from: 'curation' as const,
      title: i.title,
      url: i.canonical_url,
      notes: '',
    })),
  ...(answered.value ?? [])
    .filter((c) => !used.value.has(c.title))
    .slice(0, 5)
    .map((c) => ({
      key: c.item_id,
      from: 'engagement' as const,
      title: c.title,
      url: c.canonical_url,
      notes: c.engagement_angle ?? '',
    })),
])

const drafts = computed(() => (compositions.value ?? []).filter((c) => c.status === 'draft'))
/** Below the columns: what is on its way, then what went out. */
const later = computed(() =>
  (['scheduled', 'published'] as const).map((status) => ({
    status,
    list: (compositions.value ?? []).filter((c) => c.status === status),
  })),
)

const formatDate = (value: string) =>
  d(new Date(value), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: topic.value?.config.schedule.timezone,
  })
const when = (c: CompositionSummary) =>
  c.status === 'scheduled' && c.publish_at
    ? t('compose.list.scheduledFor', { date: formatDate(c.publish_at) })
    : t('compose.list.updated', { date: formatDate(c.updated_at) })

const creating = ref(false)
const createError = ref('')
async function create() {
  creating.value = true
  createError.value = ''
  try {
    const created = await api.createComposition(props.topicId)
    await router.push({
      name: 'composition',
      params: { topicId: props.topicId, compositionId: created.id },
    })
  } catch (err) {
    createError.value = describeError((err as Error).message, t).text
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="page-head">
    <h1 tabindex="-1">{{ t('compose.heading', { topic: topicName }) }}</h1>
    <div class="head-actions">
      <button
        type="button"
        class="button"
        data-variant="primary"
        :disabled="creating"
        @click="create"
      >
        <Icon name="plus" />
        {{ t('compose.new') }}
      </button>
      <RouterLink
        class="button"
        data-size="small"
        :to="{ name: 'series', params: { topicId, seriesId: 'new' } }"
      >
        <Icon name="calendar" />
        {{ t('series.open') }}
      </RouterLink>
    </div>
  </div>
  <p class="hint intro">{{ t('compose.intro') }}</p>
  <p v-if="createError" class="error" role="alert">{{ createError }}</p>

  <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <template v-else>
    <!-- Ideas and drafts side by side: what to write, next to what is being written. -->
    <div class="columns" :data-split="ideas.length && drafts.length ? '' : undefined">
      <section v-if="ideas.length" class="group" aria-labelledby="compose-ideas">
        <h2 id="compose-ideas">
          {{ t('compose.ideas.title') }}
          <span class="count">({{ ideas.length }})</span>
        </h2>
        <p class="hint">{{ t('compose.ideas.hint') }}</p>
        <ul class="list">
          <li v-for="idea in ideas" :key="idea.key">
            <ContentCard
              :kind="idea.from === 'curation' ? 'publication' : 'conversation'"
              :title="idea.title"
              :href="idea.url"
            >
              <template #meta>{{ t(`compose.ideas.from.${idea.from}`) }}</template>
              <template #actions>
                <ComposeFromIdea
                  :topic-id="topicId"
                  :title="idea.title"
                  :url="idea.url"
                  :notes="idea.notes"
                />
              </template>
            </ContentCard>
          </li>
        </ul>
      </section>
      <section v-if="drafts.length" class="group" aria-labelledby="compose-draft">
        <h2 id="compose-draft">
          {{ t('compose.list.groups.draft') }}
          <span class="count">({{ drafts.length }})</span>
        </h2>
        <p class="hint">{{ t('compose.list.hints.draft') }}</p>
        <ul class="list">
          <li v-for="c in drafts" :key="c.id">
            <ContentCard
              kind="creation"
              :title="c.subject || t('compose.untitled')"
              :to="{ name: 'composition', params: { topicId, compositionId: c.id } }"
            >
              <template #meta>
                {{ t(`compose.modes.${c.mode}`) }}, {{ when(c) }}
                <template v-if="c.draft_status === 'pending'">
                  , {{ t('compose.posts.drafting') }}</template
                >
              </template>
            </ContentCard>
          </li>
        </ul>
      </section>
    </div>

    <p v-if="!compositions?.length" class="empty">{{ t('compose.list.empty') }}</p>
    <section
      v-for="group in later"
      v-show="group.list.length"
      :key="group.status"
      class="group"
      :aria-labelledby="`compose-${group.status}`"
    >
      <h2 :id="`compose-${group.status}`">
        {{ t(`compose.list.groups.${group.status}`) }}
        <span class="count">({{ group.list.length }})</span>
      </h2>
      <p class="hint">{{ t(`compose.list.hints.${group.status}`) }}</p>
      <ul class="list">
        <li v-for="c in group.list" :key="c.id">
          <ContentCard
            kind="creation"
            :title="c.subject || t('compose.untitled')"
            :to="{ name: 'composition', params: { topicId, compositionId: c.id } }"
          >
            <template #meta>{{ t(`compose.modes.${c.mode}`) }}, {{ when(c) }}</template>
          </ContentCard>
        </li>
      </ul>
    </section>
  </template>
</template>

<style scoped>
/* The intro sits under the title row, before the first group. */
.intro {
  margin: calc(-1 * var(--space-2)) 0 0;
  max-width: 48rem;
}

.head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.group {
  margin-top: var(--space-6);
}

.columns {
  display: grid;
  gap: 0 var(--space-6);
}

@media (min-width: 64rem) {
  .columns[data-split] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}

.group h2 {
  margin: 0 0 var(--space-1);
  font-size: 1.25rem;
}

/* Each group: title, one line saying what it holds, then its cards. */
.group .hint {
  margin: 0 0 var(--space-3);
}

.count {
  color: var(--color-text-muted);
  font-weight: 500;
}

.list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.list li {
  display: grid;
}

.title {
  font-weight: 650;
}

.meta {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.empty {
  margin-top: var(--space-6);
}
</style>
