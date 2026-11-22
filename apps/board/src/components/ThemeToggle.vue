<script setup lang="ts">
/** Light or dark theme, for the public pages (the board has it in the account menu). */
import { useI18n } from 'vue-i18n'
import { isDark, toggleTheme } from '../lib/theme'

defineProps<{ onInk?: boolean }>()
const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :data-on-ink="onInk || undefined"
    :aria-pressed="isDark()"
    :aria-label="t('theme.dark')"
    :title="t('theme.dark')"
    @click="toggleTheme()"
  >
    <svg v-if="isDark()" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.5" />
      <path
        d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"
      />
    </svg>
    <svg v-else viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.theme-toggle:hover {
  border-color: var(--color-text);
}

.theme-toggle svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
