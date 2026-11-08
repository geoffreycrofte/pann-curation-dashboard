<script setup lang="ts">
import { canTransition, type Conversation, type ItemTopicStatus } from '@pann/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/** A conversation to join (or not). Pann never posts: the link opens it to reply. */
const props = defineProps<{ conversation: Conversation; busy: boolean }>()
const emit = defineEmits<{ setStatus: [status: ItemTopicStatus] }>()
const { t, d } = useI18n()

const c = computed(() => props.conversation)
const headingId = computed(() => `conversation-${c.value.item_id}`)
const decisionTone = computed(
  () =>
    ({ reply: 'success', watch: 'accent', skip: undefined })[c.value.engagement_decision ?? 'skip'],
)
const actions = computed(() =>
  (
    [
      { to: 'validated', label: 'engagement.actions.toReply', variant: 'primary' },
      { to: 'rejected', label: 'engagement.actions.dismiss', variant: undefined },
      { to: 'new', label: 'engagement.actions.restore', variant: undefined },
    ] as const
  ).filter((a) => canTransition(c.value.status, a.to)),
)
</script>

<template>
  <article
    class="card conversation"
    :aria-labelledby="headingId"
    tabindex="-1"
    :data-item-id="c.item_id"
  >
    <div class="score" aria-hidden="true">
      <span class="score-value">{{ c.relevance_score ?? '…' }}</span>
      <span class="score-unit">{{ c.relevance_score === null ? 'IA' : '/100' }}</span>
    </div>
    <div class="body">
      <ul class="badges">
        <li v-if="c.meta.platform" class="badge">
          {{ t(`engagement.platforms.${c.meta.platform}`) }}
        </li>
        <li v-if="c.engagement_decision" class="badge" data-dot :data-tone="decisionTone">
          {{ t(`engagement.decisions.${c.engagement_decision}`) }}
        </li>
        <li
          v-if="c.engagement_risk && c.engagement_risk !== 'low'"
          class="badge"
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
      <p
        v-if="c.excerpt && c.excerpt !== c.title"
        class="excerpt"
        :lang="c.source_lang ?? undefined"
      >
        {{ c.excerpt }}
      </p>

      <p v-if="c.engagement_angle" class="angle">
        <strong>{{ t('engagement.angle') }}</strong> {{ c.engagement_angle }}
      </p>
      <p v-if="c.triage_reason" class="reason">
        {{ t('board.reason', { reason: c.triage_reason }) }}
      </p>

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
      </ul>

      <div
        v-if="actions.length"
        class="actions"
        role="group"
        :aria-label="t('board.actions', { title: c.title })"
      >
        <button
          v-for="action in actions"
          :key="action.to"
          type="button"
          class="button"
          :data-variant="action.variant"
          :disabled="busy"
          @click="emit('setStatus', action.to)"
        >
          {{ t(action.label) }}
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.conversation {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-4);
  padding: var(--space-5);
}

.score {
  display: grid;
  place-content: center;
  width: 4rem;
  height: 4rem;
  border-radius: var(--radius);
  background: var(--color-neutral-soft);
  text-align: center;
  line-height: 1.1;
}

.score-value {
  font-family: var(--font-display);
  font-size: 1.375rem;
  font-weight: 800;
}

.score-unit {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.body {
  display: grid;
  gap: var(--space-2);
}

.title {
  margin: 0;
  font-size: 1.125rem;
}

.title a {
  color: var(--color-text);
}

.excerpt,
.angle,
.reason {
  margin: 0;
}

.excerpt {
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-1);
}
</style>
