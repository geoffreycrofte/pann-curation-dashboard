<script setup lang="ts">
/**
 * Top bar of the public pages (home, pricing, legal pages, sign-in): the name, back to the
 * home page, the pricing, signing in, and the theme. The current page is marked.
 */
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import GlimrMark from './GlimrMark.vue'
import ThemeToggle from './ThemeToggle.vue'

const { t } = useI18n()
const route = useRoute()
</script>

<template>
  <header class="public-header">
    <RouterLink to="/" class="brand">
      <GlimrMark :size="40" />
      <span class="brand-name">{{ t('app.name') }}</span>
    </RouterLink>
    <nav class="public-nav" :aria-label="t('public.navLabel')">
      <ul>
        <li>
          <RouterLink
            :to="{ name: 'pricing' }"
            class="public-link"
            :aria-current="route.name === 'pricing' ? 'page' : undefined"
          >
            {{ t('public.pricing') }}
          </RouterLink>
        </li>
        <li>
          <RouterLink
            :to="{ name: 'login' }"
            class="button"
            data-variant="primary"
            data-size="small"
            :aria-current="route.name === 'login' ? 'page' : undefined"
          >
            {{ t('public.login') }}
          </RouterLink>
        </li>
      </ul>
    </nav>
    <ThemeToggle />
  </header>
</template>

<style scoped>
.public-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3) var(--space-5);
  width: 100%;
  max-width: 80rem;
  margin: 0 auto;
  padding: var(--space-5) clamp(1rem, 5vw, 4rem);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  margin-inline-end: auto;
  color: var(--color-text);
  text-decoration: none;
}

.brand-name {
  font-family: var(--font-display);
  font-size: 1.625rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.public-nav ul {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-5);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Text link at least 44 px tall: the target is the whole row. */
.public-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  color: var(--color-text);
  font-weight: 650;
  text-decoration: none;
  text-underline-offset: 0.3em;
}

.public-link:hover,
.public-link[aria-current='page'] {
  text-decoration: underline;
  text-decoration-thickness: 2px;
}

@media (max-width: 30rem) {
  .public-header {
    gap: var(--space-3);
  }

  .public-nav ul {
    gap: var(--space-3);
  }

  .brand {
    gap: var(--space-2);
  }

  .brand-name {
    font-size: 1.375rem;
  }
}

.public-link[aria-current='page'] {
  text-decoration-color: var(--color-accent-fill);
  text-decoration-thickness: 3px;
}
</style>
