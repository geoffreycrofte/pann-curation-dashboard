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
  <ul v-else>
    <li v-for="topic in topics" :key="topic.id">
      <RouterLink :to="{ name: 'board', params: { topicId: topic.id } }">
        {{ $i18n.locale === 'fr' ? topic.name_fr : topic.name_en }}
      </RouterLink>
    </li>
  </ul>
</template>
