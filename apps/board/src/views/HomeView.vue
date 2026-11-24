<script setup lang="ts">
/** Today: what each topic needs now, across topics. A first visit starts with a topic. */
import { useQuery } from '@pinia/colada'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import StreakFlame from '../components/StreakFlame.vue'
import TopicSummary from '../components/TopicSummary.vue'
import { api } from '../lib/api'

const { t, locale } = useI18n()
const { data: topics, isPending, error } = useQuery({ key: ['topics'], query: api.topics })

// No topic yet: the first visit of the session opens the creation conversation. Leaving
// it comes back here, to the empty state (no loop).
const router = useRouter()
const FIRST_KEY = 'glimr.firstTopicOffered'
watch(
  topics,
  (list) => {
    if (!list || list.length) return
    try {
      if (sessionStorage.getItem(FIRST_KEY)) return
      sessionStorage.setItem(FIRST_KEY, '1')
    } catch {
      return
    }
    void router.replace({ name: 'new-topic' })
  },
  { immediate: true },
)
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
      <div class="topic-head">
        <h2 :id="`today-${topic.id}`">
          <RouterLink :to="{ name: 'overview', params: { topicId: topic.id } }">
            {{ locale === 'fr' ? topic.name_fr : topic.name_en }}
          </RouterLink>
        </h2>
        <StreakFlame :topic-id="topic.id" compact />
      </div>
      <TopicSummary :topic-id="topic.id" collapse-idle />
    </section>
  </template>
</template>

<style scoped>
.topic-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4);
}

.topic-head h2 {
  margin: 0;
}

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

/* A topic with nothing waiting: its name and one line, close together. */
.topic:has(.idle) {
  gap: var(--space-1);
}

.topic h2 {
  margin: 0;
  font-size: 1.375rem;
}
</style>
