<script setup lang="ts">
import type { BoardItem, ItemTopicStatus } from '@pann/shared'
import { canTransition, siteOf } from '@pann/shared'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { describeError } from '../lib/errors'
import { useTopicKinds } from '../lib/kinds'
import Icon from './Icon.vue'

const props = defineProps<{ item: BoardItem; busy: boolean }>()
const emit = defineEmits<{ setStatus: [status: ItemTopicStatus]; excludeSite: [domain: string] }>()
const { t, d } = useI18n()

const { label: kindLabel } = useTopicKinds(() => props.item.topic_id)
const headingId = computed(() => `item-${props.item.item_id}`)
/** Site of the item, offered for exclusion from the "Reject" menu. */
const site = computed(() => siteOf(props.item.canonical_url))
/** Visual level of the score tile; the score itself is also given as text. */
const level = computed(() => {
  const score = props.item.relevance_score
  if (score === null) return 'pending'
  if (score >= 80) return 'high'
  if (score >= 50) return 'mid'
  return 'low'
})
const draftTone = computed(() =>
  props.item.draft_status === 'ready'
    ? 'success'
    : props.item.draft_status === 'failed'
      ? 'danger'
      : 'accent',
)
const actions = computed(() =>
  (
    [
      { to: 'validated', label: 'action.validate', variant: 'primary' },
      { to: 'rejected', label: 'action.reject', variant: undefined },
      { to: 'new', label: 'action.restore', variant: undefined },
    ] as const
  ).filter((a) => canTransition(props.item.status, a.to)),
)
</script>

<template>
  <article
    class="card item"
    :aria-labelledby="headingId"
    tabindex="-1"
    :data-item-id="item.item_id"
  >
    <div class="score" :data-level="level" aria-hidden="true">
      <span class="score-value">{{ item.relevance_score ?? '…' }}</span>
      <span class="score-unit">{{ item.relevance_score === null ? 'IA' : '/100' }}</span>
    </div>

    <div class="body">
      <ul class="badges">
        <li v-if="item.kind" class="badge" data-tone="accent">{{ kindLabel(item.kind) }}</li>
        <li v-if="item.origin === 'manual'" class="badge">{{ t('board.manual') }}</li>
        <li v-if="item.is_commercial" class="badge" data-dot>
          {{ t('board.commercial') }}
        </li>
        <!-- Where the drafting stands: the next step of a validated item. -->
        <li v-if="item.draft_status !== 'none'" class="badge" data-dot :data-tone="draftTone">
          {{ t(`draft.status.${item.draft_status}`) }}
        </li>
      </ul>

      <!-- The title leads to the item page (summaries, posts, diffusion); the site, to the source. -->
      <h2 :id="headingId" class="title">
        <RouterLink
          :to="{ name: 'item', params: { topicId: item.topic_id, itemId: item.item_id } }"
          :lang="item.source_lang ?? undefined"
        >
          {{ item.title }}
        </RouterLink>
      </h2>

      <p v-if="item.triage_reason" class="reason">
        {{ t('board.reason', { reason: item.triage_reason }) }}
      </p>

      <div class="footer">
        <ul class="meta">
          <!-- Shown by the score tile; kept here as text for assistive technologies. -->
          <li :class="{ 'visually-hidden': item.relevance_score !== null }">
            {{
              item.relevance_score === null
                ? t('board.triagePending')
                : t('board.relevance', { score: item.relevance_score })
            }}
          </li>
          <li>
            {{
              t('board.discovered', {
                date: d(new Date(item.discovered_at), { dateStyle: 'medium' }),
              })
            }}
          </li>
          <li v-if="site" class="site">
            <a
              :href="item.canonical_url"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="t('board.sourceLabel', { site, title: item.title })"
            >
              {{ site }}
              <Icon name="external-link" :size="14" />
            </a>
          </li>
          <li v-if="item.publish_at && Date.parse(item.publish_at) > Date.now()">
            {{
              t('board.scheduledFor', {
                date: d(new Date(item.publish_at), { dateStyle: 'medium', timeStyle: 'short' }),
              })
            }}
          </li>
          <li v-if="item.draft_error" class="error">
            {{
              t('draft.statusWithError', {
                status: t(`draft.status.${item.draft_status}`),
                error: describeError(item.draft_error, t).text,
              })
            }}
          </li>
        </ul>

        <div
          v-if="actions.length"
          class="actions"
          role="group"
          :aria-label="t('board.actions', { title: item.title })"
        >
          <template v-for="action in actions" :key="action.to">
            <!-- Reject: this item only, or the whole site from now on. -->
            <DropdownMenuRoot v-if="action.to === 'rejected' && site">
              <DropdownMenuTrigger as-child>
                <button type="button" class="button" data-size="small" :disabled="busy">
                  {{ t(action.label) }}
                  <svg
                    class="chevron"
                    viewBox="0 0 16 16"
                    width="14"
                    height="14"
                    aria-hidden="true"
                  >
                    <path
                      d="M3.5 6l4.5 4.5L12.5 6"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    />
                  </svg>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent class="menu" align="start" :side-offset="6">
                  <DropdownMenuItem class="menu-item" @select="emit('setStatus', 'rejected')">
                    {{ t('reject.justThis') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem class="menu-item" @select="emit('excludeSite', site)">
                    <span>{{ t('reject.site') }}</span>
                    <span class="menu-hint">{{ t('reject.siteHint', { site }) }}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenuRoot>
            <button
              v-else
              type="button"
              class="button"
              data-size="small"
              :data-variant="action.variant"
              :disabled="busy"
              @click="emit('setStatus', action.to)"
            >
              {{ t(action.label) }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* A publication: the gold edge of its content type, as in Création and Conversations. */
.item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2) var(--space-5);
  padding: var(--space-4) var(--space-5);
  border-inline-start: 4px solid var(--color-kind-publication);
}

.item:focus-visible {
  outline-offset: 3px;
}

/* Score tile */
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

/* Content */
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

.title a {
  color: var(--color-text);
  text-decoration: underline;
  text-decoration-color: var(--color-border-subtle);
  text-decoration-thickness: 2px;
  text-underline-offset: 0.2em;
}

.title a:hover {
  text-decoration-color: currentColor;
}

/* The AI's reason supports the title: quieter, still fully readable. */
.reason {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--color-text-muted);
}

.meta {
  gap: var(--space-1) var(--space-4);
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

/* Site of the item after the date, with a separator kept silent for screen readers. */
.meta .site {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.meta .site a {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: inherit;
}

/* The separator only while date and site share a line. */
@media (min-width: 36rem) {
  .meta .site::before {
    content: '•' / '';
    margin-inline-end: var(--space-4);
  }
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
  .item {
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
