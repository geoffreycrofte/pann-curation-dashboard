<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import LangSwitcher from './components/LangSwitcher.vue'
import { session } from './lib/session'
import { supabase } from './lib/supabase'

const { t } = useI18n()
const router = useRouter()

async function signOut() {
  await supabase.auth.signOut()
  await router.push({ name: 'login' })
}
</script>

<template>
  <a class="visually-hidden skip-link" href="#main">{{ t('a11y.skipToContent') }}</a>
  <header class="app-header">
    <RouterLink to="/" class="brand">
      <span class="brand-name">{{ t('app.name') }}</span>
      <span class="brand-tagline">{{ t('app.tagline') }}</span>
    </RouterLink>
    <nav v-if="session" :aria-label="t('nav.label')" class="main-nav">
      <ul>
        <li>
          <RouterLink to="/">{{ t('nav.topics') }}</RouterLink>
        </li>
        <li>
          <RouterLink to="/connections">{{ t('nav.connections') }}</RouterLink>
        </li>
      </ul>
    </nav>
    <div class="header-tools">
      <LangSwitcher />
      <button v-if="session" type="button" class="button" @click="signOut">
        {{ t('auth.signOut') }}
      </button>
    </div>
  </header>
  <main id="main" tabindex="-1">
    <RouterView />
  </main>
</template>

<style scoped>
.skip-link:focus {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  z-index: 10;
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg);
}

.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-6);
  border-bottom: 4px solid var(--color-accent-fill);
  background: var(--color-surface);
}

.brand {
  display: flex;
  flex-direction: column;
  color: var(--color-text);
  text-decoration: none;
}

.brand-name {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.brand-tagline {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.main-nav ul {
  display: flex;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.main-nav a {
  display: inline-block;
  padding: var(--space-2) 0;
  color: var(--color-text);
  font-weight: 600;
  text-decoration: none;
}

.main-nav a[aria-current='page'] {
  color: var(--color-accent-text);
  text-decoration: underline;
  text-decoration-thickness: 3px;
  text-underline-offset: 0.3em;
}

.header-tools {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

main {
  max-width: 72rem;
  margin: 0 auto;
  padding: var(--space-6);
}

main:focus {
  outline: none;
}
</style>
