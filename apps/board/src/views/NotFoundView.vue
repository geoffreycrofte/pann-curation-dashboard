<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LandingFigure from '../components/LandingFigure.vue'
import { ILLUSTRATIONS } from '../lib/landing-images'

const { t } = useI18n()
</script>

<template>
  <div class="not-found">
    <LandingFigure
      class="figure"
      :image="ILLUSTRATIONS.empty"
      :alt="t('notFound.alt')"
      sizes="18rem"
      eager
    />
    <h1 tabindex="-1">{{ t('notFound.title') }}</h1>
    <p>{{ t('notFound.text') }}</p>
    <RouterLink to="/" class="button" data-variant="primary">{{ t('notFound.back') }}</RouterLink>
  </div>
</template>

<style scoped>
.not-found {
  display: grid;
  justify-items: center;
  gap: var(--space-4);
  max-width: 32rem;
  margin: 0 auto;
  padding: var(--space-8) var(--space-4);
  text-align: center;
}

.figure {
  width: min(18rem, 100%);
}

h1,
p {
  margin: 0;
}

a.button {
  text-decoration: none;
}
</style>
