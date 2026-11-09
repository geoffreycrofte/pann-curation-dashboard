<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import LangSwitcher from './components/LangSwitcher.vue'
import PannMark from './components/PannMark.vue'
import ThemeToggle from './components/ThemeToggle.vue'
import { api } from './lib/api'
import { session } from './lib/session'
import { supabase } from './lib/supabase'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const { data: topics } = useQuery({
  key: ['topics'],
  query: api.topics,
  enabled: () => !!session.value,
})

// Small screens: the sidebar becomes a full-screen menu under the top bar. While it is
// open, the page behind is inert and does not scroll; Escape closes it.
const narrow = window.matchMedia('(max-width: 56rem)')
const isNarrow = ref(narrow.matches)
const menuOpen = ref(false)
const topBar = ref<HTMLElement>()
const toggle = ref<HTMLButtonElement>()
const menu = ref<HTMLElement>()

function onNarrowChange(event: MediaQueryListEvent) {
  isNarrow.value = event.matches
  if (!event.matches) menuOpen.value = false
}
narrow.addEventListener('change', onNarrowChange)
onBeforeUnmount(() => {
  narrow.removeEventListener('change', onNarrowChange)
  document.documentElement.classList.remove('menu-open')
})

watch(menuOpen, async (open) => {
  document.documentElement.classList.toggle('menu-open', open && isNarrow.value)
  if (!open || !isNarrow.value) return
  // The menu starts under the top bar, whatever its height.
  menu.value?.style.setProperty('--top', `${topBar.value?.getBoundingClientRect().bottom ?? 0}px`)
  await nextTick()
  menu.value?.querySelector<HTMLElement>('a, button')?.focus()
})

async function closeMenu() {
  if (!menuOpen.value) return
  menuOpen.value = false
  await nextTick()
  toggle.value?.focus()
}

// A link was followed: the page heading takes focus (router.afterEach).
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  },
)

/** Name set in the profile, else the email. */
const displayName = computed(
  () =>
    (session.value?.user.user_metadata?.full_name as string | undefined)?.trim() ||
    session.value?.user.email ||
    '',
)

async function signOut() {
  await supabase.auth.signOut()
  await router.push({ name: 'login' })
}
</script>

<template>
  <a class="visually-hidden skip-link" href="#main">{{ t('a11y.skipToContent') }}</a>

  <div v-if="session" class="shell">
    <header class="sidebar">
      <div class="sidebar-inner">
        <div ref="topBar" class="sidebar-top">
          <RouterLink to="/" class="brand">
            <PannMark :size="44" />
            <span class="brand-text">
              <span class="brand-name">{{ t('app.name') }}</span>
              <span class="brand-tagline">{{ t('app.tagline') }}</span>
            </span>
          </RouterLink>
          <button
            ref="toggle"
            type="button"
            class="menu-toggle"
            aria-controls="sidebar-menu"
            :aria-expanded="menuOpen"
            @click="menuOpen ? closeMenu() : (menuOpen = true)"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path class="bar bar-top" d="M4 7h16" />
                <path class="bar bar-middle" d="M4 12h16" />
                <path class="bar bar-bottom" d="M4 17h16" />
              </g>
            </svg>
            {{ menuOpen ? t('nav.close') : t('nav.menu') }}
          </button>
        </div>

        <div
          id="sidebar-menu"
          ref="menu"
          class="sidebar-menu"
          :data-open="menuOpen"
          @keydown.esc="closeMenu"
        >
          <nav :aria-label="t('nav.label')">
            <p id="nav-topics" class="nav-label">{{ t('nav.topics') }}</p>
            <ul aria-labelledby="nav-topics">
              <li v-for="topic in topics" :key="topic.id">
                <RouterLink
                  :to="{ name: 'board', params: { topicId: topic.id } }"
                  class="nav-link"
                  :aria-current="route.params.topicId === topic.id ? 'page' : undefined"
                >
                  <span class="nav-dot" aria-hidden="true"></span>
                  {{ locale === 'fr' ? topic.name_fr : topic.name_en }}
                </RouterLink>
              </li>
              <li>
                <RouterLink :to="{ name: 'new-topic' }" class="nav-link nav-add">
                  <span class="nav-plus" aria-hidden="true">+</span>
                  {{ t('nav.newTopic') }}
                </RouterLink>
              </li>
            </ul>
            <p id="nav-settings" class="nav-label">{{ t('nav.settings') }}</p>
            <ul aria-labelledby="nav-settings">
              <li>
                <RouterLink :to="{ name: 'profile' }" class="nav-link">
                  <span class="nav-dot" aria-hidden="true"></span>
                  {{ t('nav.profile') }}
                </RouterLink>
              </li>
              <li>
                <RouterLink to="/connections" class="nav-link">
                  <span class="nav-dot" aria-hidden="true"></span>
                  {{ t('nav.connections') }}
                </RouterLink>
              </li>
            </ul>
          </nav>

          <div class="sidebar-bottom">
            <RouterLink :to="{ name: 'profile' }" class="account">
              <span class="visually-hidden">{{ t('nav.signedInAs') }}</span>
              <span class="account-name">{{ displayName }}</span>
              <span v-if="displayName !== session.user.email" class="account-email">
                {{ session.user.email }}
              </span>
            </RouterLink>
            <ThemeToggle />
            <LangSwitcher />
            <button type="button" class="button sign-out" @click="signOut">
              {{ t('auth.signOut') }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <main id="main" tabindex="-1" :inert="menuOpen && isNarrow">
      <RouterView />
    </main>
  </div>

  <main v-else id="main" tabindex="-1" class="public">
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
  border-radius: var(--radius);
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
}

.shell {
  display: grid;
  grid-template-columns: 17rem minmax(0, 1fr);
  min-height: 100vh;
}

/* -------------------------------------------------------------------------
 * Sidebar: ink panel with gold accents
 * ----------------------------------------------------------------------- */
.sidebar {
  background: var(--color-ink);
  color: var(--color-on-ink);
}

/* The ink background covers the whole column; its content stays in view. */
.sidebar-inner {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  height: 100vh;
  padding: var(--space-6) var(--space-4);
  overflow-y: auto;
}

.sidebar :focus-visible {
  outline-color: var(--color-focus-on-ink);
}

.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: inherit;
  text-decoration: none;
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-name {
  font-family: var(--font-display);
  font-size: 1.625rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
}

.brand-tagline {
  margin-top: var(--space-1);
  font-size: 0.8125rem;
  color: var(--color-on-ink-muted);
}

.menu-toggle {
  display: none;
  min-height: 2.75rem;
  padding: var(--space-2) var(--space-4);
  border: 1.5px solid var(--color-on-ink-muted);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-on-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.sidebar-menu {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-6);
}

.nav-label {
  margin: var(--space-4) 0 var(--space-2);
  padding: 0 var(--space-3);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-on-ink-muted);
}

nav ul {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 2.75rem;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  color: var(--color-on-ink);
  font-weight: 600;
  text-decoration: none;
}

.nav-link:hover {
  background: rgb(255 255 255 / 0.06);
}

.nav-add:not(.router-link-exact-active) {
  color: var(--color-on-ink-muted);
}

.nav-plus {
  width: 0.5rem;
  font-weight: 700;
  line-height: 1;
  text-align: center;
}

.nav-dot {
  width: 0.5rem;
  height: 0.5rem;
  border: 1.5px solid var(--color-on-ink-muted);
  border-radius: 50%;
}

/* Current page: gold fill with ink text, plus the filled dot (not color alone). */
.nav-link[aria-current='page'],
.nav-link.router-link-exact-active {
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
}

.nav-link[aria-current='page'] .nav-dot,
.nav-link.router-link-exact-active .nav-add:not(.router-link-exact-active) {
  color: var(--color-on-ink-muted);
}

.nav-plus {
  width: 0.5rem;
  font-weight: 700;
  line-height: 1;
  text-align: center;
}

.nav-dot {
  border-color: var(--color-on-accent);
  background: var(--color-on-accent);
}

.sidebar-bottom {
  display: grid;
  gap: var(--space-3);
}

/* Who is signed in, linking to the profile. */
.account {
  display: grid;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  color: var(--color-on-ink);
  text-decoration: none;
}

.account:hover {
  background: rgb(255 255 255 / 0.06);
}

.account-name {
  font-weight: 650;
  overflow-wrap: anywhere;
}

.account-email {
  font-size: 0.8125rem;
  color: var(--color-on-ink-muted);
  overflow-wrap: anywhere;
}

.sidebar-bottom :deep(.button) {
  border-color: var(--color-on-ink-muted);
  background: transparent;
  color: var(--color-on-ink);
}

.sidebar-bottom :deep(.button[aria-pressed='true']) {
  border-color: var(--color-accent-fill);
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
  box-shadow: none;
}

/* The theme itself shows the state: the toggle keeps the outline style when pressed. */
.sidebar-bottom :deep(.theme-toggle[aria-pressed='true']) {
  border-color: var(--color-on-ink-muted);
  background: transparent;
  color: var(--color-on-ink);
}

/* -------------------------------------------------------------------------
 * Main area
 * ----------------------------------------------------------------------- */
main {
  width: 100%;
  max-width: 72rem;
  padding: var(--space-8) clamp(var(--space-4), 4vw, 3.5rem) 4rem;
}

main:focus {
  outline: none;
}

main.public {
  max-width: none;
  padding: 0;
}

@media (max-width: 56rem) {
  /* The top bar keeps its own height; the page takes the rest. */
  .shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto 1fr;
  }

  /* Top bar stays in view; the open menu fills the screen under it. */
  .sidebar {
    position: sticky;
    top: 0;
    z-index: 30;
  }

  .sidebar-inner {
    position: static;
    height: auto;
    padding: var(--space-3) var(--space-4);
    overflow: visible;
  }

  .menu-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .sidebar-menu:not([data-open='true']) {
    display: none;
  }

  .sidebar-menu[data-open='true'] {
    position: fixed;
    inset: var(--top, 4.5rem) 0 0;
    gap: 0;
    padding: var(--space-2) var(--space-4) var(--space-4);
    background: var(--color-ink);
    /* Opens as a circle growing from the Menu button. */
    animation: menu-reveal 0.4s cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  /* Topics and settings scroll when the screen is short; the controls stay at the bottom. */
  .sidebar-menu[data-open='true'] nav {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .sidebar-menu[data-open='true'] nav li {
    animation: menu-item-in 0.35s 0.08s both cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  .sidebar-menu[data-open='true'] .sidebar-bottom {
    padding-top: var(--space-4);
    border-top: 1px solid rgb(255 255 255 / 0.12);
  }

  .nav-link {
    min-height: 3rem;
    font-size: 1.0625rem;
  }

  .brand-tagline {
    display: none;
  }

  /* The burger turns into a cross. */
  .bar {
    transition:
      transform 0.25s,
      opacity 0.2s;
    transform-origin: 12px 12px;
  }

  .menu-toggle[aria-expanded='true'] .bar-top {
    transform: translateY(5px) rotate(45deg);
  }

  .menu-toggle[aria-expanded='true'] .bar-middle {
    opacity: 0;
  }

  .menu-toggle[aria-expanded='true'] .bar-bottom {
    transform: translateY(-5px) rotate(-45deg);
  }
}

@keyframes menu-reveal {
  from {
    clip-path: circle(0 at calc(100% - 3rem) 0);
  }
  to {
    clip-path: circle(150% at calc(100% - 3rem) 0);
  }
}

@keyframes menu-item-in {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }
}

@media (forced-colors: active) {
  .nav-link[aria-current='page'] {
    border: 2px solid Highlight;
  }
}
</style>
