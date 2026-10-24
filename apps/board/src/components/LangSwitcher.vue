<script setup lang="ts">
import { LANGS } from '@pann/shared'
import { useI18n } from 'vue-i18n'
import { setLang } from '../i18n'

const { t, locale } = useI18n()
</script>

<template>
  <div role="group" :aria-label="t('lang.label')" class="lang-switcher">
    <button
      v-for="lang in LANGS"
      :key="lang"
      type="button"
      class="button"
      :lang="lang"
      :aria-pressed="locale === lang"
      @click="setLang(lang)"
    >
      {{ t(`lang.${lang}`) }}
    </button>
  </div>
</template>

<style scoped>
.lang-switcher {
  display: flex;
  gap: var(--space-2);
}

.lang-switcher .button {
  flex: 1;
  padding-inline: var(--space-3);
}

/* Selected language: filled, not color alone (aria-pressed is announced). */
.button[aria-pressed='true'] {
  border-color: var(--color-text);
  background: var(--color-text);
  color: var(--color-surface);
}
</style>
