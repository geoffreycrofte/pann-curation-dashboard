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
      path: '/login',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/t/:topicId',
      name: 'board',
      component: () => import('./views/BoardView.vue'),
      props: true,
    },
    {
      path: '/t/:topicId/sources',
      name: 'sources',
      component: () => import('./views/SourcesView.vue'),
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

router.beforeEach(async (to) => {
  await initSession()
  if (!to.meta.public && !session.value) return { name: 'login' }
  if (to.name === 'login' && session.value) return { name: 'home' }
})

/** Move focus to the main heading after each navigation (SPA page change announcement). */
router.afterEach(() => {
  requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus())
})
