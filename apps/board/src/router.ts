import { createRouter, createWebHistory } from 'vue-router'
import { initSession, session } from './lib/session'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
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
      path: '/topics/new',
      name: 'new-topic',
      component: () => import('./views/NewTopicView.vue'),
    },
    {
      path: '/t/:topicId',
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
      path: '/t/:topicId/sources',
      name: 'sources',
      component: () => import('./views/SourcesView.vue'),
      props: true,
    },
    {
      path: '/t/:topicId/diffusion',
      name: 'diffusion',
      component: () => import('./views/QueueView.vue'),
      props: true,
    },
    {
      path: '/t/:topicId/newsletter',
      name: 'newsletter',
      component: () => import('./views/NewsletterView.vue'),
      props: true,
    },
    {
      path: '/t/:topicId/engagement',
      name: 'engagement',
      component: () => import('./views/EngagementView.vue'),
      props: true,
    },
    {
      path: '/t/:topicId/settings',
      name: 'settings',
      component: () => import('./views/SettingsView.vue'),
      props: true,
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
