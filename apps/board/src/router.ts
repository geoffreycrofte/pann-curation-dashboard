import { createRouter, createWebHistory } from 'vue-router'
import { initSession, session } from './lib/session'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Signed in: the topics. Signed out: App shows the marketing page instead.
    {
      path: '/',
      name: 'home',
      component: () => import('./views/HomeView.vue'),
      meta: { public: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('./views/ProfileView.vue'),
    },
    {
      // Platform admins only: the API answers 404 to anyone else.
      path: '/admin',
      name: 'admin',
      component: () => import('./views/AdminView.vue'),
    },
    {
      path: '/connections',
      name: 'connections',
      component: () => import('./views/ConnectionsView.vue'),
    },
    {
      // Authorization Path of the Supabase OAuth server (Claude and other MCP clients).
      path: '/oauth/consent',
      name: 'oauth-consent',
      component: () => import('./views/ConsentView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
      meta: { public: true },
    },
    {
      // Sign-up stays on invitation: people without an account ask for one here.
      path: '/request-access',
      name: 'request-access',
      component: () => import('./views/RequestAccessView.vue'),
      meta: { public: true },
    },
    {
      // Full screen, without the sidebar: the view brings its own header and main.
      path: '/topics/new',
      name: 'new-topic',
      component: () => import('./views/NewTopicView.vue'),
      meta: { chromeless: true },
    },
    {
      // A topic opens on its overview: what to do next, figures, coming publications.
      path: '/t/:topicId',
      name: 'overview',
      component: () => import('./views/OverviewView.vue'),
      props: true,
    },
    {
      // News watch (curation): items by status.
      path: '/t/:topicId/curation',
      name: 'board',
      component: () => import('./views/BoardView.vue'),
      props: true,
    },
    {
      path: '/t/:topicId/items/:itemId',
      name: 'item',
      component: () => import('./views/ItemView.vue'),
      props: true,
    },
    {
      // What goes out, for every tool: scheduled posts, history, newsletter.
      path: '/t/:topicId/calendar',
      name: 'calendar',
      component: () => import('./views/CalendarView.vue'),
      props: true,
    },
    {
      path: '/t/:topicId/engagement',
      name: 'engagement',
      component: () => import('./views/EngagementView.vue'),
      props: true,
    },
    {
      // Every setting of the topic, grouped by subject (?tab=…), whatever the tool.
      path: '/t/:topicId/settings',
      name: 'settings',
      component: () => import('./views/SettingsView.vue'),
      props: true,
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('./views/NotFoundView.vue'),
      meta: { public: true },
    },
  ],
})

/** Page asked before signing in (e.g. the OAuth consent page), resumed afterwards. */
const REDIRECT_KEY = 'pann.redirect'

function remember(path: string | null) {
  try {
    if (path) localStorage.setItem(REDIRECT_KEY, path)
    else localStorage.removeItem(REDIRECT_KEY)
  } catch {
    // storage unavailable: the user lands on the home page
  }
}

function recall(): string | null {
  try {
    const path = localStorage.getItem(REDIRECT_KEY)
    // Same-origin paths only.
    return path && path.startsWith('/') && !path.startsWith('//') ? path : null
  } catch {
    return null
  }
}

router.beforeEach(async (to) => {
  await initSession()
  if (!to.meta.public && !session.value) {
    // The magic link opens a new tab: keep the page in localStorage, not in the URL.
    if (to.name !== 'home') remember(to.fullPath)
    return { name: 'login' }
  }
  if (session.value && (to.name === 'login' || to.name === 'home')) {
    const path = recall()
    remember(null)
    if (path) return path
    if (to.name === 'login') return { name: 'home' }
  }
})

/** Move focus to the main heading after each navigation (SPA page change announcement). */
router.afterEach(() => {
  requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus())
})
