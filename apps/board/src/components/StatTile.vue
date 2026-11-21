<script setup lang="ts">
/**
 * A figure that leads somewhere: an icon on the tone of what it counts, the number, what
 * it is. The whole tile is the link; its name is the number and the label together.
 */
import type { RouteLocationRaw } from 'vue-router'
import Icon from './Icon.vue'

defineProps<{
  icon: string
  value: number
  label: string
  to: RouteLocationRaw
  tone?: 'publication' | 'conversation' | 'creation' | 'danger'
  hint?: string
}>()
</script>

<template>
  <RouterLink :to="to" class="stat card" :data-tone="tone">
    <span class="tile" aria-hidden="true"><Icon :name="icon" :size="22" /></span>
    <span class="value">{{ value }}</span>
    <span class="label">{{ label }}</span>
    <span v-if="hint" class="hint">{{ hint }}</span>
    <!-- Says the tile leads somewhere; the link itself carries the name. -->
    <Icon name="arrow-right" :size="18" class="go" />
  </RouterLink>
</template>

<style scoped>
.stat {
  --tone: var(--color-text-muted);
  --tone-soft: var(--color-neutral-soft);

  display: grid;
  grid-template-columns: auto 1fr auto;
  /* Figure and label stay together when a sibling tile is taller. */
  align-content: center;
  align-items: center;
  gap: var(--space-1) var(--space-3);
  min-height: 2.75rem;
  padding: var(--space-4);
  color: var(--color-text);
  text-decoration: none;
  transition:
    box-shadow 0.15s,
    transform 0.15s;
}

.stat:hover {
  box-shadow: var(--shadow-raised);
}

.go {
  grid-row: 1 / span 2;
  grid-column: 3;
  color: var(--color-text-muted);
  transition: transform 0.15s;
}

.stat:hover .go {
  color: var(--color-text);
}

@media (prefers-reduced-motion: no-preference) {
  .stat:hover {
    transform: translateY(-1px);
  }

  .stat:hover .go {
    transform: translateX(2px);
  }
}

[data-tone='publication'] {
  --tone: var(--color-kind-publication);
  --tone-soft: var(--color-kind-publication-soft);
}

[data-tone='conversation'] {
  --tone: var(--color-kind-conversation);
  --tone-soft: var(--color-kind-conversation-soft);
}

[data-tone='creation'] {
  --tone: var(--color-kind-creation);
  --tone-soft: var(--color-kind-creation-soft);
}

[data-tone='danger'] {
  --tone: var(--color-danger);
  --tone-soft: var(--color-danger-soft);

  border-color: var(--color-danger);
}

.tile {
  display: grid;
  grid-row: span 2;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius);
  background: var(--tone-soft);
  color: var(--tone);
}

.value {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1;
}

.label {
  font-weight: 600;
}

.value,
.label {
  grid-column: 2;
}

.hint {
  grid-column: 1 / -1;
  margin: 0;
}
</style>
