<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ topicId: string }>()
const { t } = useI18n()

const links = [
  { name: 'board', label: 'topicNav.board' },
  { name: 'sources', label: 'topicNav.sources' },
  { name: 'settings', label: 'topicNav.settings' },
] as const
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
/* Segmented control: the current section is filled in gold (and bold). */
.topic-nav ul {
  display: inline-flex;
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

.topic-nav a {
  display: inline-flex;
  align-items: center;
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
