<script setup lang="ts">
/**
 * Création: the questions people ask again and again in the conversations of the topic,
 * each an idea for a post that answers it. Found on request (it uses the workspace's AI),
 * then kept until asked again.
 */
import { useQuery } from '@pinia/colada'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../lib/api'
import { describeError } from '../../lib/errors'
import ContentCard from '../ContentCard.vue'
import Icon from '../Icon.vue'
import ComposeFromIdea from './ComposeFromIdea.vue'

const props = defineProps<{ topicId: string }>()
const { t, d, locale } = useI18n()

const { data, refetch } = useQuery({
  key: () => ['question-ideas', props.topicId],
  query: () => api.questionIdeas(props.topicId),
})
const pending = computed(() => data.value?.status === 'pending')
const asking = ref(false)
const message = ref('')

// While the job runs: read again every 2 seconds.
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  data,
  () => {
    clearTimeout(timer)
    if (pending.value) timer = setTimeout(() => void refetch(), 2000)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))

async function find() {
  asking.value = true
  message.value = ''
  try {
    await api.requestQuestionIdeas(props.topicId, locale.value === 'en' ? 'en' : 'fr')
    await refetch()
  } catch (err) {
    message.value = describeError((err as Error).message, t).text
  } finally {
    asking.value = false
  }
}

/** Notes of the new post: the angle, then the conversations it comes from. */
const notesOf = (idea: NonNullable<typeof data.value>['ideas'][number]) =>
  [idea.angle, '', ...idea.examples.map((e) => `- ${e.title} (${e.url})`)].join('\n')
</script>

<template>
  <section class="questions" aria-labelledby="compose-questions">
    <h2 id="compose-questions">
      {{ t('compose.questions.title') }}
      <span v-if="data?.ideas.length" class="count">({{ data.ideas.length }})</span>
    </h2>
    <p class="hint">{{ t('compose.questions.hint') }}</p>

    <ul v-if="data?.ideas.length" class="list">
      <li v-for="idea in data.ideas" :key="idea.question">
        <ContentCard kind="conversation" :title="idea.question">
          <template #meta>{{ t('compose.questions.count', idea.count) }}</template>
          <p class="angle">{{ idea.angle }}</p>
          <template #actions>
            <ComposeFromIdea :topic-id="topicId" :title="idea.question" :notes="notesOf(idea)" />
          </template>
        </ContentCard>
      </li>
    </ul>
    <p v-else-if="data?.generated_at && !pending">{{ t('compose.questions.none') }}</p>

    <div class="questions-actions">
      <button
        type="button"
        class="button"
        data-size="small"
        :disabled="pending || asking"
        @click="find"
      >
        <Icon name="sparkles" />
        {{ data?.generated_at ? t('compose.questions.again') : t('compose.questions.find') }}
      </button>
      <span v-if="pending" role="status">{{ t('compose.questions.pending') }}</span>
      <span v-else-if="data?.generated_at" class="hint">
        {{
          t('compose.questions.generatedOn', {
            date: d(new Date(data.generated_at), { dateStyle: 'medium' }),
          })
        }}
      </span>
    </div>
    <p
      v-if="data?.status === 'failed' && data.error"
      class="notice notice-inline"
      data-tone="danger"
      role="alert"
    >
      <Icon name="alert-circle" />
      <span>{{ describeError(data.error, t).text }}</span>
    </p>
    <p v-if="message" class="notice notice-inline" data-tone="danger" role="alert">
      <Icon name="alert-circle" />
      <span>{{ message }}</span>
    </p>
  </section>
</template>

<style scoped>
/* Same layout as the other groups of Création: title, one line, then the cards. */
.questions {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-6);
}

.questions h2 {
  margin: 0;
  font-size: 1.25rem;
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

.angle {
  margin: 0;
  color: var(--color-text-muted);
}

.questions-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

p {
  margin: 0;
}
</style>
