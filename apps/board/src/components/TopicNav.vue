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
.topic-nav ul {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin: 0 0 var(--space-4);
  padding: 0;
  list-style: none;
}

.topic-nav a {
  display: inline-block;
  padding: var(--space-2) 0;
  color: var(--color-text);
  font-weight: 600;
}

.topic-nav a[aria-current='page'] {
  color: var(--color-accent-text);
  text-decoration-thickness: 3px;
}

.topic-nav a:not([aria-current='page']) {
  text-decoration: none;
}
</style>
