<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { dismissToast, TOAST_MS, toasts } from '../lib/toast'

/**
 * Success confirmations, bottom right. The list is a live region present from the
 * start, so screen readers announce each new confirmation. A confirmation leaves after
 * a few seconds, except while the pointer or the focus is on it (WCAG 2.2.1).
 */
const { t } = useI18n()
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function arm(id: number) {
  clearTimeout(timers.get(id))
  timers.set(
    id,
    setTimeout(() => close(id), TOAST_MS),
  )
}
function hold(id: number) {
  clearTimeout(timers.get(id))
  timers.delete(id)
}
function close(id: number) {
  hold(id)
  dismissToast(id)
}

watch(
  toasts,
  (list) => {
    for (const item of list) if (!timers.has(item.id)) arm(item.id)
  },
  { deep: true },
)
onBeforeUnmount(() => timers.forEach((timer) => clearTimeout(timer)))
</script>

<template>
  <div class="toaster" role="status" aria-live="polite">
    <div
      v-for="item in toasts"
      :key="item.id"
      class="toast"
      @mouseenter="hold(item.id)"
      @mouseleave="arm(item.id)"
      @focusin="hold(item.id)"
      @focusout="arm(item.id)"
    >
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      <p class="text">{{ item.text }}</p>
      <button
        type="button"
        class="close"
        :aria-label="t('toast.close', { text: item.text })"
        @click="close(item.id)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.toaster {
  position: fixed;
  right: var(--space-4);
  bottom: var(--space-4);
  z-index: 60;
  display: grid;
  gap: var(--space-2);
  width: min(24rem, calc(100vw - 2 * var(--space-4)));
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
  border-radius: var(--radius);
  background: var(--color-success-fill);
  color: var(--color-on-success);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.25);
  font-weight: 650;
  pointer-events: auto;
  animation: enter 0.2s ease-out;
}

.text {
  flex: 1;
  margin: 0;
}

.icon,
.close svg {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.close {
  display: grid;
  place-items: center;
  flex: none;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.close:hover {
  background: rgb(255 255 255 / 0.15);
}

.close:focus-visible {
  outline: 3px solid var(--color-on-success);
  outline-offset: -3px;
}

@keyframes enter {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast {
    animation: none;
  }
}

@media (forced-colors: active) {
  .toast {
    border: 2px solid CanvasText;
  }
}
</style>
