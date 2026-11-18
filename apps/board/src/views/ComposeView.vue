<script setup lang="ts">
/** Création tool of a topic: the posts written by the person, by state. */
import { useQuery } from '@pinia/colada'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
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

const GROUPS = ['draft', 'scheduled', 'published'] as const
const groups = computed(() =>
  GROUPS.map((status) => ({
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
  <div class="head">
    <h1 tabindex="-1">{{ t('compose.heading', { topic: topicName }) }}</h1>
    <button
      type="button"
      class="button"
      data-variant="primary"
      :disabled="creating"
      @click="create"
    >
      {{ t('compose.new') }}
    </button>
  </div>
  <p class="hint">{{ t('compose.intro') }}</p>
  <p v-if="createError" class="error" role="alert">{{ createError }}</p>

  <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <p v-else-if="!compositions?.length" class="empty">{{ t('compose.list.empty') }}</p>
  <template v-else>
    <section
      v-for="group in groups"
      v-show="group.list.length"
      :key="group.status"
      class="group"
      :aria-labelledby="`compose-${group.status}`"
    >
      <h2 :id="`compose-${group.status}`">
        {{ t(`compose.list.groups.${group.status}`) }}
        <span class="count">({{ group.list.length }})</span>
      </h2>
      <ul class="list">
        <li v-for="c in group.list" :key="c.id">
          <RouterLink
            :to="{ name: 'composition', params: { topicId, compositionId: c.id } }"
            class="title"
          >
            {{ c.subject || t('compose.untitled') }}
          </RouterLink>
          <span class="meta">
            {{ t(`compose.modes.${c.mode}`) }}, {{ when(c) }}
            <template v-if="c.draft_status === 'pending'">
              , {{ t('compose.posts.drafting') }}</template
            >
          </span>
        </li>
      </ul>
    </section>
  </template>
</template>

<style scoped>
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3) var(--space-5);
}

.head h1 {
  margin: 0;
}

.group {
  margin-top: var(--space-6);
}

.group h2 {
  font-size: 1.25rem;
}

.count {
  color: var(--color-text-muted);
  font-weight: 500;
}

.list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.list li {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
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
