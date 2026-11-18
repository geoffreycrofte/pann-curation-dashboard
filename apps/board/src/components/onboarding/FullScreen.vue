<script setup lang="ts">
/**
 * Full-screen frame without the board around it (topic creation, adjusting a topic
 * with the assistant): a bar with the brand, where the person is, and the ways out; a
 * centred column of 840px at most; on wide screens, an illustration in the right margin.
 */
import { useI18n } from 'vue-i18n'
import PannMark from '../PannMark.vue'

defineProps<{ status: string; navLabel: string }>()
const { t } = useI18n()
</script>

<template>
  <div class="full-screen">
    <header class="bar">
      <p class="brand">
        <PannMark :size="32" />
        <span>{{ t('onboarding.thread.brand') }}</span>
      </p>
      <p class="progress">{{ status }}</p>
      <nav class="links" :aria-label="navLabel">
        <slot name="links" />
      </nav>
    </header>

    <main id="main" tabindex="-1" class="column">
      <slot />
    </main>

    <div v-if="$slots.art" class="art" aria-hidden="true">
      <slot name="art" />
    </div>
  </div>
</template>

<style scoped>
.full-screen {
  min-height: 100vh;
  background: var(--color-bg);
}

.bar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-5);
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-bg);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-weight: 700;
  font-size: 1.125rem;
}

.progress {
  flex: 1;
  margin: 0;
  color: var(--color-text-muted);
}

.links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.column {
  display: grid;
  gap: var(--space-6);
  width: min(100% - 2 * var(--space-4), 840px);
  margin-inline: auto;
  padding-block: var(--space-7, 3rem) var(--space-8, 6rem);
}

.column:focus {
  outline: none;
}

.column h1 {
  margin: 0;
}

/* Wide screens only: in the right margin, never under the column. */
.art {
  display: none;
}

@media (min-width: 75rem) {
  .art {
    position: fixed;
    right: 0;
    bottom: 0;
    z-index: 0;
    display: block;
    width: calc((100vw - 840px) / 2 - var(--space-6));
    height: min(70vh, 40rem);
    overflow: hidden;
    pointer-events: none;
  }

  .art :deep(.pan-art) {
    position: absolute;
    bottom: 6vh;
    left: var(--space-4);
    width: max(130%, 22rem);
  }
}

@media (max-width: 40rem) {
  /* Three rows on a phone: the bar scrolls away instead of covering the conversation. */
  .bar {
    position: static;
    padding-inline: var(--space-4);
  }

  .progress {
    flex-basis: 100%;
    order: 3;
  }
}
</style>
