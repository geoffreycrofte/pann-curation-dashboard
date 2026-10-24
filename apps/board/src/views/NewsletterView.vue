<script setup lang="ts">
import type { Lang } from '@pann/shared'
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
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TopicNav from '../components/TopicNav.vue'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { useTopicName } from '../lib/topic-name'

const props = defineProps<{ topicId: string }>()
const { t, d } = useI18n()
const queryCache = useQueryCache()
const topicName = useTopicName(() => props.topicId)

const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const {
  data: state,
  isPending,
  error,
} = useQuery({
  key: () => ['newsletter', props.topicId],
  query: () => api.newsletter(props.topicId),
})

const formatDate = (value: string, style: 'full' | 'medium' = 'full') =>
  d(new Date(value), {
    dateStyle: style,
    timeStyle: 'short',
    timeZone: topic.value?.config.schedule.timezone,
  })
const langName = (lang: Lang) => t(`draft.langs.${lang}`)

const message = ref('')
const isError = ref(false)
const { mutate: send, isLoading: sending } = useMutation({
  mutation: (lang: Lang) => api.sendNewsletter(props.topicId, lang),
  onSuccess() {
    isError.value = false
    message.value = t('newsletter.sending')
    // The job sends in the background: read the history again a little later.
    for (const delay of [3000, 8000])
      setTimeout(() => queryCache.invalidateQueries({ key: ['newsletter', props.topicId] }), delay)
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <h1 tabindex="-1">{{ t('newsletter.heading', { topic: topicName }) }}</h1>
  <TopicNav :topic-id="topicId" />
  <p>{{ t('newsletter.intro') }}</p>

  <p v-if="isPending" role="status">{{ t('common.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <template v-else-if="state">
    <p>
      {{
        state.next_at
          ? t('newsletter.nextAuto', { date: formatDate(state.next_at) })
          : t('newsletter.manual')
      }}
      <RouterLink :to="{ name: 'settings', params: { topicId } }">{{
        t('newsletter.settingsLink')
      }}</RouterLink>
    </p>
    <p role="status" :class="{ error: isError }">{{ message }}</p>

    <div class="previews">
      <section
        v-for="preview in state.previews"
        :key="preview.lang"
        class="card preview"
        :aria-labelledby="`preview-${preview.lang}`"
      >
        <h2 :id="`preview-${preview.lang}`">
          {{ t('newsletter.preview', { lang: langName(preview.lang) }) }}
        </h2>
        <p>
          {{ t('newsletter.period', { date: formatDate(preview.period_from, 'medium') }) }}.
          {{ t('newsletter.count', preview.item_count) }}.
        </p>
        <p v-if="preview.without_summary" class="hint">
          {{
            t(
              'newsletter.withoutSummary',
              { lang: langName(preview.lang), n: preview.without_summary },
              preview.without_summary,
            )
          }}
        </p>
        <p :lang="preview.lang">{{ t('newsletter.subject', { subject: preview.subject }) }}</p>
        <p v-if="!preview.configured" class="error">
          {{ t('newsletter.notConfigured', { lang: langName(preview.lang) }) }}
        </p>
        <iframe
          class="frame"
          :title="t('newsletter.frameTitle', { lang: langName(preview.lang) })"
          :srcdoc="preview.html"
          sandbox=""
          loading="lazy"
        ></iframe>
        <AlertDialogRoot v-if="preview.configured && preview.item_count">
          <AlertDialogTrigger as-child>
            <button
              type="button"
              class="button"
              data-variant="primary"
              :disabled="sending"
              :aria-label="t('newsletter.sendLabel', { lang: langName(preview.lang) })"
            >
              {{ t('newsletter.send') }}
            </button>
          </AlertDialogTrigger>
          <AlertDialogPortal>
            <AlertDialogOverlay class="dialog-overlay" />
            <AlertDialogContent class="dialog">
              <AlertDialogTitle class="dialog-title">
                {{ t('newsletter.confirmTitle', { lang: langName(preview.lang) }) }}
              </AlertDialogTitle>
              <AlertDialogDescription>{{ t('newsletter.confirmText') }}</AlertDialogDescription>
              <div class="dialog-actions">
                <AlertDialogCancel class="button">{{ t('common.cancel') }}</AlertDialogCancel>
                <AlertDialogAction
                  class="button"
                  data-variant="primary"
                  @click="send(preview.lang)"
                >
                  {{ t('newsletter.send') }}
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialogRoot>
      </section>
    </div>

    <section aria-labelledby="history" class="history">
      <h2 id="history">{{ t('newsletter.history') }}</h2>
      <p v-if="!state.issues.length">{{ t('newsletter.empty') }}</p>
      <div v-else class="table-wrap">
        <table>
          <caption class="visually-hidden">
            {{
              t('newsletter.historyCaption')
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ t('newsletter.date') }}</th>
              <th scope="col">{{ t('newsletter.lang') }}</th>
              <th scope="col">{{ t('newsletter.items') }}</th>
              <th scope="col">{{ t('newsletter.status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="issue in state.issues" :key="issue.id">
              <td>{{ formatDate(issue.sent_at ?? issue.created_at, 'medium') }}</td>
              <td>{{ langName(issue.lang) }}</td>
              <td>{{ issue.item_count }}</td>
              <td>
                <span :data-status="issue.status" class="status">{{
                  t(`newsletter.statuses.${issue.status}`)
                }}</span>
                <span v-if="issue.last_error" class="detail">
                  {{ describeError(issue.last_error, t).text }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </template>
</template>

<style scoped>
.previews {
  display: grid;
  gap: var(--space-5);
  margin-top: var(--space-5);
}

@media (min-width: 72rem) {
  .previews {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
}

.preview {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
}

.preview h2,
.preview p {
  margin: 0;
}

.preview h2 {
  font-size: 1.25rem;
}

.frame {
  width: 100%;
  height: 32rem;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
}

.preview .button {
  justify-self: start;
}

.history {
  margin-top: var(--space-8);
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
  text-align: start;
  vertical-align: top;
}

.status {
  font-weight: 650;
}

.status[data-status='sent'] {
  color: var(--color-success);
}

.status[data-status='failed'] {
  color: var(--color-danger);
}

.detail {
  display: block;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
</style>
