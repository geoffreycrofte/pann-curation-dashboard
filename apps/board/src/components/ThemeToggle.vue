<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { isDark, toggleTheme } from '../lib/theme'

const { t } = useI18n()
</script>

<template>
  <!-- One toggle button: aria-pressed tells whether dark mode is on. -->
  <button type="button" class="button theme-toggle" :aria-pressed="isDark()" @click="toggleTheme">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <g v-if="isDark()" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="4.5" />
        <path
          d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        />
      </g>
      <path
        v-else
        d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
      />
    </svg>
    {{ t('theme.dark') }}
  </button>
</template>
