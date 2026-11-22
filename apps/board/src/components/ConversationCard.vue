<script setup lang="ts">
import { canTransition, type Conversation, type ItemTopicStatus } from '@glimr/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ComposeFromIdea from './compose/ComposeFromIdea.vue'
import Icon from './Icon.vue'
import ReplyDraft from './ReplyDraft.vue'

/** A conversation to join (or not). Glimr never posts: the link opens it to reply. */
const props = defineProps<{
  conversation: Conversation
  busy: boolean
  /** Replies marked in its community over 7 days, and the topic limit (null: none). */
  weekCount?: number
  weekLimit?: number | null
}>()
const emit = defineEmits<{ setStatus: [status: ItemTopicStatus] }>()
const { t, d } = useI18n()

const c = computed(() => props.conversation)
const headingId = computed(() => `conversation-${c.value.item_id}`)
const decisionTone = computed(
  () =>
    ({ reply: 'success', watch: 'accent', skip: undefined })[c.value.engagement_decision ?? 'skip'],
)
/** Visual level of the score tile, as on the news watch cards; the score is also text. */
const level = computed(() => {
  const score = c.value.relevance_score
  if (score === null) return 'pending'
  if (score >= 80) return 'high'
  if (score >= 50) return 'mid'
  return 'low'
})
const actions = computed(() =>
  (
    [
      { to: 'published', label: 'engagement.actions.markReplied', variant: 'primary' },
      { to: 'validated', label: 'engagement.actions.toReply', variant: 'primary' },
      { to: 'rejected', label: 'engagement.actions.dismiss', variant: undefined },
      { to: 'new', label: 'engagement.actions.restore', variant: undefined },
      { to: 'validated', label: 'engagement.actions.unmarkReplied', variant: undefined },
    ] as const
  )
    // "To reply" from a replied conversation is "Back to reply", said once.
    .filter((a) => !(c.value.status === 'published' && a.label === 'engagement.actions.toReply'))
    .filter(
      (a) => !(c.value.status !== 'published' && a.label === 'engagement.actions.unmarkReplied'),
    )
    .filter((a) => canTransition(c.value.status, a.to, 'engagement')),
)
/** Past the weekly limit of its community: a reminder before replying again. */
const overLimit = computed(
  () =>
    c.value.status !== 'published' &&
    props.weekLimit != null &&
    (props.weekCount ?? 0) >= props.weekLimit,
)
</script>

<template>
  <article
    class="card conversation"
    :aria-labelledby="headingId"
    tabindex="-1"
    :data-item-id="c.item_id"
  >
    <div class="score" :data-level="level" aria-hidden="true">
      <span class="score-value">{{ c.relevance_score ?? '…' }}</span>
      <span class="score-unit">{{ c.relevance_score === null ? 'IA' : '/100' }}</span>
    </div>
    <div class="body">
      <ul class="badges">
        <li v-if="c.meta.platform" class="badge">
          {{ t(`engagement.platforms.${c.meta.platform}`) }}
        </li>
        <!-- The AI's advice helps to sort: "Reply" is what the button says, so only the
             other advice (watch, skip) gets a badge, and none once the person has chosen. -->
        <li
          v-if="c.status === 'new' && c.engagement_decision && c.engagement_decision !== 'reply'"
          class="badge"
          data-dot
          :data-tone="decisionTone"
        >
          {{ t(`engagement.decisions.${c.engagement_decision}`) }}
        </li>
        <li
          v-if="c.engagement_risk && c.engagement_risk !== 'low'"
          class="badge"
          data-dot
          :data-tone="c.engagement_risk === 'high' ? 'danger' : 'accent'"
        >
          {{ t(`engagement.risks.${c.engagement_risk}`) }}
        </li>
      </ul>

      <h2 :id="headingId" class="title">
        <a
          :href="c.canonical_url"
          target="_blank"
          rel="noopener noreferrer"
          :lang="c.source_lang ?? undefined"
        >
          {{ c.title }}
          <span class="visually-hidden">{{ t('engagement.opensNewTab') }}</span>
        </a>
      </h2>

      <!-- How to help leads; the start of the discussion follows, quieter and short. -->
      <p v-if="c.engagement_angle" class="angle">
        <strong>{{ t('engagement.angle') }}</strong> {{ c.engagement_angle }}
      </p>
      <p
        v-if="c.excerpt && c.excerpt !== c.title"
        class="excerpt"
        :lang="c.source_lang ?? undefined"
      >
        {{ c.excerpt }}
      </p>
      <p v-if="c.triage_reason" class="reason">
        {{ t('board.reason', { reason: c.triage_reason }) }}
      </p>
      <p v-if="overLimit" class="notice notice-inline">
        <Icon name="alert-circle" />
        <span>{{
          t('engagement.weekly.over', {
            count: weekCount,
            limit: weekLimit,
            platform: c.meta.platform ? t(`engagement.platforms.${c.meta.platform}`) : '',
          })
        }}</span>
      </p>

      <!-- Once the person chose to reply: a suggestion to adapt, never posted by Glimr. -->
      <ReplyDraft v-if="c.status === 'validated'" :conversation="c" />

      <div class="footer">
        <ul class="meta">
          <li :class="{ 'visually-hidden': c.relevance_score !== null }">
            {{
              c.relevance_score === null
                ? t('engagement.pending')
                : t('engagement.opportunity', { score: c.relevance_score })
            }}
          </li>
          <li v-if="c.meta.author">{{ t('engagement.by', { author: c.meta.author }) }}</li>
          <li v-if="c.published_at">
            {{ d(new Date(c.published_at), { dateStyle: 'medium', timeStyle: 'short' }) }}
          </li>
          <li v-if="c.meta.points != null">{{ t('engagement.points', c.meta.points) }}</li>
          <li v-if="c.meta.comments != null">{{ t('engagement.replies', c.meta.comments) }}</li>
          <li v-if="c.replied_at">
            {{
              t('engagement.repliedOn', {
                date: d(new Date(c.replied_at), { dateStyle: 'medium' }),
              })
            }}
          </li>
        </ul>

        <div
          v-if="actions.length || c.status === 'validated'"
          class="actions"
          role="group"
          :aria-label="t('board.actions', { title: c.title })"
        >
          <button
            v-for="action in actions"
            :key="action.to"
            type="button"
            class="button"
            data-size="small"
            :data-variant="action.variant"
            :disabled="busy"
            @click="emit('setStatus', action.to)"
          >
            {{ t(action.label) }}
          </button>
          <!-- A question worth answering is often worth a post of its own. -->
          <ComposeFromIdea
            v-if="c.status === 'validated'"
            :topic-id="c.topic_id"
            :title="c.title"
            :url="c.canonical_url"
            :notes="c.engagement_angle ?? ''"
          />
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* A conversation: the teal edge of its content type, laid out like the news watch cards. */
.conversation {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2) var(--space-5);
  padding: var(--space-4) var(--space-5);
  border-inline-start: 4px solid var(--color-kind-conversation);
}

.conversation:focus-visible {
  outline-offset: 3px;
}

/* Score tile: same levels as on the news watch cards. */
.score {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  border-radius: var(--radius-lg);
  background: var(--color-surface-2);
  color: var(--color-text);
}

.score-value {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1;
}

.score-unit {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.score[data-level='high'] {
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
}

.score[data-level='high'] .score-unit {
  color: var(--color-on-accent);
}

.score[data-level='mid'] {
  background: var(--color-accent-soft);
}

.score[data-level='pending'] {
  border: 1.5px dashed var(--color-border);
  background: transparent;
}

.body {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

.badges,
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.title {
  margin: 0;
  font-size: 1.1875rem;
  line-height: 1.3;
}

.angle,
.excerpt,
.reason {
  margin: 0;
}

/* The discussion as a short quote: two lines, the rest on the site. */
.excerpt {
  display: -webkit-box;
  overflow: hidden;
  padding-inline-start: var(--space-3);
  border-inline-start: 2px solid var(--color-border-subtle);
  font-size: 0.9375rem;
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.reason {
  font-size: 0.9375rem;
  color: var(--color-text-muted);
}

.meta {
  gap: var(--space-1) var(--space-4);
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-1);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

@media (max-width: 36rem) {
  .conversation {
    grid-template-columns: 1fr;
  }

  .score {
    flex-direction: row;
    gap: var(--space-1);
    width: auto;
    height: auto;
    padding: var(--space-1) var(--space-3);
    justify-self: start;
    border-radius: var(--radius-pill);
  }

  .score-value {
    font-size: 1.125rem;
  }
}
</style>
