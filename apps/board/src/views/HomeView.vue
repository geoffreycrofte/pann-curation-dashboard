<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { api } from '../lib/api'

const { t } = useI18n()
const router = useRouter()
const { data: topics, isPending, error } = useQuery({ key: ['topics'], query: api.topics })

// Single-board shortcut: go straight to the first topic.
watch(topics, (list) => {
  const first = list?.[0]
  if (list?.length === 1 && first) router.replace({ name: 'board', params: { topicId: first.id } })
})
</script>

<template>
  <h1 tabindex="-1">{{ t('board.topics') }}</h1>
  <p v-if="isPending" role="status">{{ t('board.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <p v-else-if="!topics?.length">{{ t('board.noTopic') }}</p>
  <ul v-else class="topics">
    <li v-for="topic in topics" :key="topic.id">
      <RouterLink :to="{ name: 'board', params: { topicId: topic.id } }" class="card topic">
        <span class="topic-mark" aria-hidden="true"></span>
        <span class="topic-name">{{ $i18n.locale === 'fr' ? topic.name_fr : topic.name_en }}</span>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.topics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr));
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.topic {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: 6rem;
  padding: var(--space-5);
  color: var(--color-text);
  text-decoration: none;
}

.topic:hover {
  border-color: var(--color-text);
}

.topic-mark {
  flex: none;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius);
  background: var(--color-accent-fill);
}

.topic-name {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
}
</style>
