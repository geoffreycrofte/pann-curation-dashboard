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

const props = defineProps<{ item: BoardItem; busy: boolean }>()
const emit = defineEmits<{ setStatus: [status: ItemTopicStatus]; excludeSite: [domain: string] }>()
const { t, d } = useI18n()

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
      <ul class="chips">
        <li v-if="item.kind" class="chip chip-kind">{{ t(`kind.${item.kind}`) }}</li>
        <li v-if="item.origin === 'manual'" class="chip">{{ t('board.manual') }}</li>
        <li v-if="item.is_commercial" class="chip chip-warning">{{ t('board.commercial') }}</li>
      </ul>

      <h2 :id="headingId" class="title">
        <a
          :href="item.canonical_url"
          target="_blank"
          rel="noopener noreferrer"
          :lang="item.source_lang ?? undefined"
        >
          {{ item.title }}
        </a>
      </h2>

      <p v-if="item.triage_reason" class="reason">
        {{ t('board.reason', { reason: item.triage_reason }) }}
      </p>

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
        <li v-if="item.publish_at && Date.parse(item.publish_at) > Date.now()">
          {{
            t('board.scheduledFor', {
              date: d(new Date(item.publish_at), { dateStyle: 'medium', timeStyle: 'short' }),
            })
          }}
        </li>
        <li v-if="item.draft_status !== 'none'" :class="{ error: item.draft_error }">
          {{
            item.draft_error
              ? t('draft.statusWithError', {
                  status: t(`draft.status.${item.draft_status}`),
                  error: describeError(item.draft_error, t).text,
                })
              : t(`draft.status.${item.draft_status}`)
          }}
        </li>
      </ul>

      <div class="footer">
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
                <button type="button" class="button" :disabled="busy">
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
              :data-variant="action.variant"
              :disabled="busy"
              @click="emit('setStatus', action.to)"
            >
              {{ t(action.label) }}
            </button>
          </template>
        </div>
        <RouterLink
          class="detail-link"
          :to="{ name: 'item', params: { topicId: item.topic_id, itemId: item.item_id } }"
          :aria-label="t('board.openDetailLabel', { title: item.title })"
        >
          {{ t('board.openDetail') }}
          <span aria-hidden="true">→</span>
        </RouterLink>
      </div>
    </div>
  </article>
</template>

<style scoped>
.item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-5);
  padding: var(--space-5);
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
  width: 4.5rem;
  height: 4.5rem;
  border-radius: var(--radius-lg);
  background: var(--color-surface-2);
  color: var(--color-text);
}

.score-value {
  font-family: var(--font-display);
  font-size: 1.75rem;
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

.chips,
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.chip {
  padding: 0.125rem var(--space-3);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-pill);
  background: var(--color-surface-2);
  font-size: 0.8125rem;
  font-weight: 650;
}

.chip-kind {
  border-color: var(--color-text);
}

.chip-warning {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.title {
  margin: 0;
  font-size: 1.25rem;
}

.title a {
  color: var(--color-text);
  text-decoration: none;
}

.title a:hover {
  text-decoration: underline;
}

.reason {
  margin: 0;
  color: var(--color-text);
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
  margin-top: var(--space-2);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.detail-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 2.75rem;
  font-weight: 650;
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
