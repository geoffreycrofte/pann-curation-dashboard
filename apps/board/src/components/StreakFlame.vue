<script setup lang="ts">
/**
 * Publication streak of a topic: the weeks in a row with a post published, with a flame.
 * Lit and flickering when this week is done, dim while this week still waits, grey while
 * the topic is paused (a paused week does not break the streak). The text says it all; the
 * flame is decorative, and still for those who asked for less motion.
 */
import { useQuery } from '@pinia/colada'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'

const props = defineProps<{ topicId: string; compact?: boolean }>()
const { t } = useI18n()

const { data: streak } = useQuery({
  key: () => ['streak', props.topicId],
  query: () => api.topicStreak(props.topicId),
})
const state = computed(() => {
  const s = streak.value
  if (!s) return null
  if (s.paused) return 'paused'
  if (s.this_week) return 'lit'
  return s.weeks > 0 ? 'at-risk' : 'none'
})
const detail = computed(() => {
  const s = streak.value
  if (!s || !state.value) return ''
  if (state.value === 'paused') return t('streak.paused')
  if (state.value === 'lit') return t('streak.lit')
  if (state.value === 'at-risk') return s.scheduled ? t('streak.scheduled') : t('streak.atRisk')
  return s.scheduled ? t('streak.startScheduled') : t('streak.start')
})
</script>

<template>
  <p v-if="streak && state" class="streak" :data-state="state" :data-compact="compact || undefined">
    <svg class="flame" viewBox="0 0 24 32" aria-hidden="true" focusable="false">
      <path
        class="outer"
        d="M12 1c1 5 7 8.5 7 16a7 7 0 0 1-14 0c0-3.5 1.6-5.8 3.2-7.6.3 2.4 1.4 3.9 2.8 4.6C10 9.5 10.6 5 12 1Z"
      />
      <path
        class="inner"
        d="M12 15c.4 2.6 3.5 4.2 3.5 7.6a3.5 3.5 0 0 1-7 0c0-1.8.8-3 1.7-3.9.2 1.1.7 1.8 1.4 2.1-.1-2.3.1-4.1.4-5.8Z"
      />
    </svg>
    <span class="streak-text">
      <strong class="weeks">{{ t('streak.weeks', streak.weeks) }}</strong>
      <span :class="compact ? 'visually-hidden' : 'detail'">{{ detail }}</span>
    </span>
  </p>
</template>

<style scoped>
.streak {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-1) var(--space-4) var(--space-1) var(--space-2);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
}

.streak[data-compact] {
  padding: 0 var(--space-3) 0 var(--space-1);
  font-size: 0.875rem;
}

.flame {
  flex: none;
  width: 1.75rem;
  height: 2.25rem;
  transform-origin: 50% 90%;
}

.streak[data-compact] .flame {
  width: 1.25rem;
  height: 1.625rem;
}

.outer {
  fill: var(--color-flame);
}

.inner {
  fill: var(--color-accent-fill);
}

/* Lit: the flame dances. */
.streak[data-state='lit'] .flame {
  animation: flicker 1.6s ease-in-out infinite;
}

.streak[data-state='lit'] .inner {
  animation: glow 1.1s ease-in-out infinite alternate;
  transform-origin: 50% 90%;
}

/* This week still waits: a lower, quieter flame. */
.streak[data-state='at-risk'] .flame {
  opacity: 0.75;
  animation: flicker 3.2s ease-in-out infinite;
}

.streak[data-state='paused'] .flame,
.streak[data-state='none'] .flame {
  filter: grayscale(1);
  opacity: 0.55;
}

.streak-text {
  display: grid;
  line-height: 1.25;
}

.weeks {
  font-family: var(--font-display);
  font-weight: 800;
}

.detail {
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}

@keyframes flicker {
  0%,
  100% {
    transform: rotate(-2deg) scaleY(1);
  }

  50% {
    transform: rotate(2deg) scaleY(1.06);
  }
}

@keyframes glow {
  to {
    transform: scale(0.85, 0.92);
  }
}

@media (prefers-reduced-motion: reduce) {
  .flame,
  .inner {
    animation: none !important;
  }
}

@media (forced-colors: active) {
  .outer,
  .inner {
    fill: CanvasText;
  }
}
</style>
