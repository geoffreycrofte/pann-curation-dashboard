<script setup lang="ts">
import type { BoardItem, ItemTopicStatus } from '@pann/shared'
import { canTransition } from '@pann/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ item: BoardItem; busy: boolean }>()
const emit = defineEmits<{ setStatus: [status: ItemTopicStatus] }>()
const { t, d } = useI18n()

const headingId = computed(() => `item-${props.item.item_id}`)
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
  <article class="card" :aria-labelledby="headingId" tabindex="-1" :data-item-id="item.item_id">
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
    <ul class="meta">
      <li v-if="item.kind" class="kind">{{ t(`kind.${item.kind}`) }}</li>
      <li v-if="item.origin === 'manual'">{{ t('board.manual') }}</li>
      <li>
        {{
          item.relevance_score === null
            ? t('board.noScore')
            : t('board.relevance', { score: item.relevance_score })
        }}
      </li>
      <li>
        {{
          t('board.discovered', { date: d(new Date(item.discovered_at), { dateStyle: 'medium' }) })
        }}
      </li>
    </ul>
    <div
      v-if="actions.length"
      class="actions"
      role="group"
      :aria-label="t('board.actions', { title: item.title })"
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
  </article>
</template>

<style scoped>
.card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-left: 6px solid var(--color-accent-fill);
  border-radius: var(--radius);
  background: var(--color-surface);
}

.title {
  margin: 0;
  font-size: 1.125rem;
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

.kind {
  font-weight: 600;
  color: var(--color-text);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
