<script setup lang="ts">
/** Today: what each topic needs now, across topics. A first visit starts with a topic. */
import { useQuery } from '@pinia/colada'
import { useI18n } from 'vue-i18n'
import TopicSummary from '../components/TopicSummary.vue'
import { api } from '../lib/api'

const { t, locale } = useI18n()
const { data: topics, isPending, error } = useQuery({ key: ['topics'], query: api.topics })
</script>

<template>
  <h1 tabindex="-1">{{ t('today.heading') }}</h1>
  <p v-if="isPending" role="status">{{ t('board.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <div v-else-if="!topics?.length" class="empty">
    <p>{{ t('today.empty') }}</p>
    <p>
      <RouterLink :to="{ name: 'new-topic' }" class="button" data-variant="primary">
        {{ t('today.createFirst') }}
      </RouterLink>
    </p>
  </div>
  <template v-else>
    <p class="hint">{{ t('today.intro') }}</p>
    <section
      v-for="topic in topics"
      :key="topic.id"
      class="topic"
      :aria-labelledby="`today-${topic.id}`"
    >
      <h2 :id="`today-${topic.id}`">
        <RouterLink :to="{ name: 'overview', params: { topicId: topic.id } }">
          {{ locale === 'fr' ? topic.name_fr : topic.name_en }}
        </RouterLink>
      </h2>
      <TopicSummary :topic-id="topic.id" />
    </section>
  </template>
</template>

<style scoped>
.empty {
  display: grid;
  gap: var(--space-3);
  max-width: 36rem;
}

.empty p {
  margin: 0;
}

.topic {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-6);
}

.topic h2 {
  margin: 0;
  font-size: 1.375rem;
}
</style>
