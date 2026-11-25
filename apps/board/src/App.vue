<script setup lang="ts">
import BillingBanner from './components/BillingBanner.vue'
import { useQuery } from '@pinia/colada'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  watchEffect,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AccountMenu from './components/AccountMenu.vue'
import PublicFooter from './components/PublicFooter.vue'
import PublicHeader from './components/PublicHeader.vue'
import Toaster from './components/Toaster.vue'
import GlimrLogo from './components/GlimrLogo.vue'
import { api } from './lib/api'
import { session } from './lib/session'
import { pageDetail } from './lib/page-title'
import { setCurrentWorkspace, useWorkspace, useWorkspaceTopics } from './lib/workspace'
import WorkspaceSwitcher from './components/WorkspaceSwitcher.vue'

const LandingView = defineAsyncComponent(() => import('./views/LandingView.vue'))

const { t, te, locale } = useI18n()
const route = useRoute()
const router = useRouter()

// Same query as useWorkspace (shared cache): shows the admin link to platform admins.
const { data: me } = useQuery({
  key: ['me'],
  query: api.me,
  enabled: () => !!session.value,
})

const { data: topics } = useWorkspaceTopics(() => !!session.value)
const { workspaceId } = useWorkspace()

// The current topic shows its tools under its name: curation, engagement (the ones
// that are on) and the settings of the topic. Same query as its pages: shared cache.
const currentTopicId = computed(() =>
  typeof route.params.topicId === 'string' ? route.params.topicId : undefined,
)
const { data: currentTopic } = useQuery({
  key: () => ['topic', currentTopicId.value ?? ''],
  query: () => api.topic(currentTopicId.value!),
  enabled: () => !!session.value && !!currentTopicId.value,
})
// A topic of another workspace (a link, an e-mail): its workspace becomes the current one.
watch(currentTopic, (topic) => {
  if (topic && workspaceId.value && topic.workspace_id !== workspaceId.value)
    setCurrentWorkspace(topic.workspace_id)
})
// Document title, from the most specific to the most general: what the page shows (an
// item, a tab), the page, the topic, Glimr. The marketing page sets its own.
watchEffect(() => {
  if (!session.value && route.name === 'home') return
  const name = String(route.name ?? '')
  const key = `pageTitle.${name}`
  const topic = currentTopic.value
  const parts = [
    pageDetail.value,
    name && te(key) ? t(key) : '',
    currentTopicId.value && topic ? (locale.value === 'fr' ? topic.name_fr : topic.name_en) : '',
    t('app.name'),
  ]
  document.title = parts.filter(Boolean).join(t('pageTitle.separator'))
})

/** Sections of the open topic: its overview, its tools that are on, what goes out, settings. */
const topicSections = computed(() => {
  // Before the topic is loaded: its defaults (curation on, engagement off).
  const modules = currentTopic.value?.config.modules ?? {
    curation: true,
    engagement: false,
    compose: false,
  }
  const name = String(route.name ?? '')
  return [
    { key: 'overview', to: 'overview', active: name === 'overview' },
    ...(modules.curation
      ? [{ key: 'curation', to: 'board', active: name === 'board' || name === 'item' }]
      : []),
    ...(modules.engagement
      ? [{ key: 'engagement', to: 'engagement', active: name === 'engagement' }]
      : []),
    ...(modules.compose
      ? [{ key: 'compose', to: 'compose', active: name === 'compose' || name === 'composition' }]
      : []),
    { key: 'calendar', to: 'calendar', active: name === 'calendar' },
    { key: 'topicSettings', to: 'settings', active: name === 'settings' },
  ]
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

/** While the menu closes, it stays shown for its closing animation (none if reduced). */
const menuClosing = ref(false)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let closingTimer: ReturnType<typeof setTimeout> | undefined
const MENU_CLOSE_MS = 260

async function closeMenu() {
  if (!menuOpen.value) return
  menuOpen.value = false
  if (isNarrow.value && !reducedMotion.matches) {
    menuClosing.value = true
    clearTimeout(closingTimer)
    closingTimer = setTimeout(() => (menuClosing.value = false), MENU_CLOSE_MS)
  }
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
</script>

<template>
  <a class="visually-hidden skip-link" href="#main">{{ t('a11y.skipToContent') }}</a>

  <!-- Topic creation: full screen, its own header and main; the board rebuilds after. -->
  <RouterView v-if="session && route.meta.chromeless" />

  <div v-else-if="session" class="shell">
    <header class="sidebar">
      <div class="sidebar-inner">
        <div ref="topBar" class="sidebar-top">
          <RouterLink to="/" class="brand">
            <span class="brand-text">
              <GlimrLogo :height="36" />
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
            <!-- Both words take the same room: the button keeps its width (no jump). -->
            <span class="toggle-label">
              <span :data-shown="!menuOpen || undefined">{{ t('nav.menu') }}</span>
              <span :data-shown="menuOpen || undefined">{{ t('nav.close') }}</span>
            </span>
          </button>
        </div>

        <div
          id="sidebar-menu"
          ref="menu"
          class="sidebar-menu"
          :data-open="menuOpen"
          :data-closing="menuClosing || undefined"
          @keydown.esc="closeMenu"
        >
          <nav :aria-label="t('nav.label')">
            <WorkspaceSwitcher />
            <p id="nav-topics" class="nav-label">{{ t('nav.topics') }}</p>
            <ul aria-labelledby="nav-topics">
              <li v-for="topic in topics" :key="topic.id">
                <!-- The topic opens its first section; "true": a page of it is open. -->
                <RouterLink
                  :to="{ name: 'overview', params: { topicId: topic.id } }"
                  class="nav-link"
                  :aria-current="topic.id === currentTopicId ? 'true' : undefined"
                >
                  <span class="nav-dot" aria-hidden="true"></span>
                  {{ locale === 'fr' ? topic.name_fr : topic.name_en }}
                </RouterLink>
                <ul
                  v-if="topic.id === currentTopicId"
                  class="nav-children"
                  :aria-label="
                    t('nav.topicSections', {
                      topic: locale === 'fr' ? topic.name_fr : topic.name_en,
                    })
                  "
                >
                  <li v-for="section in topicSections" :key="section.key">
                    <RouterLink
                      :to="{ name: section.to, params: { topicId: topic.id } }"
                      class="nav-child"
                      :aria-current="section.active ? 'page' : undefined"
                    >
                      {{ t(`nav.${section.key}`) }}
                    </RouterLink>
                  </li>
                </ul>
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
              <li v-if="me?.is_platform_admin">
                <RouterLink :to="{ name: 'admin' }" class="nav-link">
                  <span class="nav-dot" aria-hidden="true"></span>
                  {{ t('nav.admin') }}
                </RouterLink>
              </li>
            </ul>
          </nav>

          <div class="sidebar-bottom">
            <AccountMenu />
          </div>
        </div>
      </div>
    </header>

    <main id="main" tabindex="-1" :inert="menuOpen && isNarrow">
      <BillingBanner />
      <RouterView />
    </main>
  </div>

  <!-- Signed out on the home page: the marketing page brings its own header, main and footer. -->
  <LandingView v-else-if="route.name === 'home'" />

  <!-- Signed out elsewhere (pricing, legal pages, sign-in): the public header and footer. -->
  <div v-else class="public-page">
    <!-- Sign-in stays focused on its form: its own way back, no header or footer. -->
    <PublicHeader v-if="route.name !== 'login'" />
    <main id="main" tabindex="-1" class="public">
      <RouterView />
    </main>
    <PublicFooter v-if="route.name !== 'login'" />
  </div>
  <Toaster />
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
  /* Slides in when the board rebuilds around a new topic (styles/conversation.css). */
  view-transition-name: sidebar;
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
  gap: var(--space-1);
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

/* Current page, or the topic a page belongs to: gold fill with ink text, plus the
 * filled dot (not color alone). */
.nav-link[aria-current],
.nav-link.router-link-exact-active {
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
}

.nav-link[aria-current] .nav-dot,
.nav-link.router-link-exact-active .nav-dot {
  border-color: var(--color-on-accent);
  background: var(--color-on-accent);
}

/* Tools of the current topic, under its name. The current one: bold, with a gold bar
 * (not color alone). */
.nav-children {
  display: grid;
  gap: 0.125rem;
  margin: var(--space-1) 0 var(--space-2);
  padding: 0 0 0 calc(var(--space-3) + 0.25rem);
  list-style: none;
}

.nav-child {
  display: flex;
  align-items: center;
  min-height: 2.5rem;
  padding: var(--space-1) var(--space-3);
  border-inline-start: 2px solid rgb(255 255 255 / 0.14);
  color: var(--color-on-ink-muted);
  font-weight: 600;
  text-decoration: none;
}

.nav-child:hover {
  color: var(--color-on-ink);
  background: rgb(255 255 255 / 0.06);
}

.nav-child[aria-current='page'] {
  border-inline-start: 4px solid var(--color-accent-on-ink);
  padding-inline-start: calc(var(--space-3) - 2px);
  color: var(--color-on-ink);
  font-weight: 750;
}

.sidebar-bottom {
  display: grid;
  gap: var(--space-3);
}

/* -------------------------------------------------------------------------
 * Main area
 * ----------------------------------------------------------------------- */
main {
  width: 100%;
  max-width: 72rem;
  /* Centred in the space the sidebar leaves. */
  margin-inline: auto;
  padding: var(--space-8) clamp(var(--space-4), 4vw, 3.5rem) 4rem;
}

main:focus {
  outline: none;
}

/* Public pages: header, the page, then the footer at the bottom even on a short page. */
.public-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

main.public {
  flex: 1;
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

  .sidebar-menu:not([data-open='true']):not([data-closing]) {
    display: none;
  }

  .sidebar-menu[data-open='true'],
  .sidebar-menu[data-closing] {
    position: fixed;
    inset: var(--top, 4.5rem) 0 0;
    gap: 0;
    padding: var(--space-2) var(--space-4) var(--space-4);
    overflow: hidden;
    isolation: isolate;
  }

  /* The ink grows as a circle from the Menu button. A scaled disc, not a clip-path: the
   * browser moves it on the GPU instead of repainting the screen at every frame. */
  .sidebar-menu[data-open='true']::before,
  .sidebar-menu[data-closing]::before {
    content: '';
    position: absolute;
    top: 0;
    right: 3rem;
    z-index: -1;
    width: 300vmax;
    height: 300vmax;
    border-radius: 50%;
    background: var(--color-ink);
    transform: translate(50%, -50%) scale(1);
    will-change: transform;
    animation: menu-disc-in 0.4s cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  /* Closing: the same circle shrinks back into the button, the links fade first. */
  .sidebar-menu[data-closing]::before {
    animation: menu-disc-out 0.26s cubic-bezier(0.4, 0, 0.8, 0.2) forwards;
  }

  .sidebar-menu[data-closing] > * {
    animation: menu-content-out 0.14s ease-in forwards;
  }

  /* Topics and settings scroll when the screen is short; the controls stay at the bottom. */
  .sidebar-menu[data-open='true'] nav,
  .sidebar-menu[data-closing] nav {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .sidebar-menu[data-open='true'] nav li {
    animation: menu-item-in 0.35s 0.08s both cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  .sidebar-menu[data-open='true'] .sidebar-bottom,
  .sidebar-menu[data-closing] .sidebar-bottom {
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

  /*
   * The burger turns into a cross: each outer bar first moves to the middle line, then
   * turns around the centre of the icon (the rightmost transform applies first).
   */
  .bar {
    transition:
      transform 0.25s,
      opacity 0.2s;
    transform-box: view-box;
    transform-origin: 12px 12px;
  }

  .menu-toggle[aria-expanded='true'] .bar-top {
    transform: rotate(45deg) translateY(5px);
  }

  .menu-toggle[aria-expanded='true'] .bar-middle {
    opacity: 0;
  }

  .menu-toggle[aria-expanded='true'] .bar-bottom {
    transform: rotate(-45deg) translateY(-5px);
  }
}

@keyframes menu-disc-in {
  from {
    transform: translate(50%, -50%) scale(0);
  }
}

@keyframes menu-disc-out {
  to {
    transform: translate(50%, -50%) scale(0);
  }
}

@keyframes menu-content-out {
  to {
    opacity: 0;
  }
}

/* Less motion asked: the menu appears and goes at once. */
@media (prefers-reduced-motion: reduce) {
  .sidebar-menu::before,
  .sidebar-menu nav li {
    animation: none !important;
  }
}

@keyframes menu-item-in {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }
}

@media (forced-colors: active) {
  .nav-link[aria-current] {
    border: 2px solid Highlight;
  }

  .nav-child[aria-current='page'] {
    border-inline-start-color: Highlight;
  }
}
</style>
