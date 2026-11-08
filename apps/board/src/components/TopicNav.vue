<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'

const props = defineProps<{ topicId: string }>()
const { t } = useI18n()

// Same query as the settings page: shared cache.
const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})

const LINKS = [
  { name: 'board', label: 'topicNav.board', module: 'curation' },
  { name: 'diffusion', label: 'topicNav.diffusion', module: 'curation' },
  { name: 'newsletter', label: 'topicNav.newsletter', module: 'curation' },
  { name: 'sources', label: 'topicNav.sources', module: 'curation' },
  { name: 'engagement', label: 'topicNav.engagement', module: 'engagement' },
  { name: 'settings', label: 'topicNav.settings', module: null },
] as const

/**
 * Sections of a tool show while it is on. Before the topic is loaded, curation shows
 * (on by default) and engagement waits (off by default), so nothing flickers.
 */
const links = computed(() =>
  LINKS.filter((link) => {
    if (link.module === 'curation') return topic.value?.config.modules.curation !== false
    if (link.module === 'engagement') return topic.value?.config.modules.engagement === true
    return true
  }),
)
</script>

<template>
  <nav :aria-label="t('topicNav.label')" class="topic-nav">
    <ul>
      <li v-for="link in links" :key="link.name">
        <!-- RouterLink sets aria-current="page" on the exact active route. -->
        <RouterLink :to="{ name: link.name, params: { topicId } }" exact-active-class="active">
          {{ t(link.label) }}
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
/* Segmented control over the full width: the current section is filled in gold (and bold). */
.topic-nav ul {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: 0 0 var(--space-6);
  padding: var(--space-1);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
  list-style: none;
}

.topic-nav li {
  flex: 1 1 auto;
}

.topic-nav a {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: var(--space-2) var(--space-5);
  border-radius: var(--radius-pill);
  color: var(--color-text);
  font-weight: 600;
  text-decoration: none;
}

.topic-nav a:hover {
  background: var(--color-surface-2);
}

.topic-nav a[aria-current='page'] {
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
  font-weight: 750;
}

@media (forced-colors: active) {
  .topic-nav a[aria-current='page'] {
    border: 2px solid Highlight;
  }
}
</style>
