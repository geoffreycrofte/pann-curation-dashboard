<script setup lang="ts">
/**
 * Top bar of the public pages (home, how it works, pricing, legal pages): the name, the
 * main pages, signing in, the theme. On a small screen, a burger opens a full-screen menu
 * (a circle growing from the button) with the pages, signing in, the theme and the
 * language. While it is open, the page behind is inert and does not scroll; Escape closes
 * it and focus goes back to the button.
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import GlimrLogo from './GlimrLogo.vue'
import LangSwitcher from './LangSwitcher.vue'
import ThemeToggle from './ThemeToggle.vue'

const { t } = useI18n()
const route = useRoute()

const PAGES = [
  { name: 'home', key: 'home' },
  { name: 'how-it-works', key: 'how' },
  { name: 'pricing', key: 'pricing' },
] as const
const current = (name: string) => (route.name === name ? 'page' : undefined)

const open = ref(false)
const toggle = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()

/** The page behind the menu: out of reach for focus and screen readers while it is open. */
function setBehind(inert: boolean) {
  document.documentElement.classList.toggle('menu-open', inert)
  for (const el of document.querySelectorAll<HTMLElement>('#main, .public-footer')) el.inert = inert
}

watch(open, async (value) => {
  setBehind(value)
  if (!value) return
  await nextTick()
  panel.value?.querySelector<HTMLElement>('a, button')?.focus()
})

async function close() {
  if (!open.value) return
  open.value = false
  await nextTick()
  toggle.value?.focus()
}

// A link was followed: the menu closes (the new page's heading takes focus).
watch(
  () => route.fullPath,
  () => {
    open.value = false
  },
)
onBeforeUnmount(() => setBehind(false))
</script>

<template>
  <header class="public-header" @keydown.esc="close">
    <div class="bar-row">
      <RouterLink to="/" class="brand">
        <GlimrLogo :height="34" />
      </RouterLink>

      <!-- Wide screens: the links and the theme in the bar. -->
      <nav class="public-nav" :aria-label="t('public.navLabel')">
        <ul>
          <li v-for="page in PAGES.slice(1)" :key="page.key">
            <RouterLink
              :to="{ name: page.name }"
              class="public-link"
              :aria-current="current(page.name)"
            >
              {{ t(`public.footer.links.${page.key}`) }}
            </RouterLink>
          </li>
          <li>
            <RouterLink
              :to="{ name: 'login' }"
              class="button"
              data-variant="primary"
              data-size="small"
            >
              {{ t('public.login') }}
            </RouterLink>
          </li>
        </ul>
      </nav>
      <ThemeToggle class="bar-theme" />

      <!-- Small screens: the burger. -->
      <button
        ref="toggle"
        type="button"
        class="burger"
        aria-controls="public-menu"
        :aria-expanded="open"
        @click="open ? close() : (open = true)"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path class="line line-top" d="M4 7h16" />
            <path class="line line-middle" d="M4 12h16" />
            <path class="line line-bottom" d="M4 17h16" />
          </g>
        </svg>
        <!-- Both words take the same room: the button keeps its width (no jump). -->
        <span class="toggle-label">
          <span :data-shown="!open || undefined">{{ t('nav.menu') }}</span>
          <span :data-shown="open || undefined">{{ t('nav.close') }}</span>
        </span>
      </button>
    </div>

    <div id="public-menu" ref="panel" class="menu-panel" :data-open="open || undefined">
      <nav :aria-label="t('public.navLabel')">
        <ul class="menu-pages">
          <li v-for="(page, index) in PAGES" :key="page.key" :style="{ '--i': index }">
            <RouterLink
              :to="{ name: page.name }"
              class="menu-link"
              :aria-current="current(page.name)"
            >
              {{ t(`public.footer.links.${page.key}`) }}
            </RouterLink>
          </li>
        </ul>
      </nav>
      <RouterLink
        :to="{ name: 'login' }"
        class="button menu-login"
        data-variant="primary"
        :style="{ '--i': PAGES.length }"
      >
        {{ t('public.login') }}
      </RouterLink>
      <div class="menu-settings" :style="{ '--i': PAGES.length + 1 }">
        <LangSwitcher class="menu-lang" />
        <ThemeToggle />
      </div>
    </div>
  </header>
</template>

<style scoped>
.public-header {
  width: 100%;
  max-width: 80rem;
  margin: 0 auto;
  padding: var(--space-5) clamp(1rem, 5vw, 4rem);
}

.bar-row {
  display: flex;
  align-items: center;
  gap: var(--space-3) var(--space-5);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  margin-inline-end: auto;
  color: var(--color-text);
  text-decoration: none;
}

.public-nav ul {
  display: flex;
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

.public-link[aria-current='page'] {
  text-decoration-color: var(--color-accent-fill);
  text-decoration-thickness: 3px;
}

/* ------------------------------------------------------------- burger */
.burger,
.menu-panel {
  display: none;
}

@media (max-width: 48rem) {
  .public-nav,
  .bar-theme {
    display: none;
  }

  .burger {
    position: relative;
    /* Above the open menu, which it closes. */
    z-index: 32;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 2.75rem;
    padding: var(--space-2) var(--space-4);
    border: 1.5px solid var(--color-text);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-weight: 650;
    cursor: pointer;
    transition:
      color 0.25s,
      border-color 0.25s;
  }

  .burger[aria-expanded='true'] {
    border-color: var(--color-on-ink);
    color: var(--color-on-ink);
  }

  .burger:focus-visible {
    outline-color: var(--color-focus-on-ink);
  }

  /* The brand stays readable above the ink while the menu is open. */
  .brand {
    position: relative;
    z-index: 32;
    transition: color 0.25s;
  }

  .public-header:has([data-open]) .brand {
    color: var(--color-on-ink);
  }

  /* The burger turns into a cross: the outer bars meet in the middle, then turn. */
  .line {
    transition:
      transform 0.3s cubic-bezier(0.2, 0.7, 0.2, 1),
      opacity 0.2s;
    transform-box: view-box;
    transform-origin: 12px 12px;
  }

  .burger[aria-expanded='true'] .line-top {
    transform: rotate(45deg) translateY(5px);
  }

  .burger[aria-expanded='true'] .line-middle {
    opacity: 0;
  }

  .burger[aria-expanded='true'] .line-bottom {
    transform: rotate(-45deg) translateY(-5px);
  }

  /* The menu: ink over the whole screen, its own colours for what it holds. */
  .menu-panel[data-open] {
    --color-text: var(--color-on-ink);
    --color-surface: var(--color-ink);
    --color-border: var(--color-on-ink-muted);
    --color-focus: var(--color-focus-on-ink);

    position: fixed;
    inset: 0;
    z-index: 31;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding: calc(var(--space-5) + 2.75rem + var(--space-8)) clamp(1rem, 5vw, 4rem)
      calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
    overflow-y: auto;
    background: var(--color-ink);
    color: var(--color-on-ink);
    /* A circle of ink grows from the burger. */
    animation: public-menu-reveal 0.5s cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  .menu-panel :focus-visible {
    outline-color: var(--color-focus-on-ink);
  }

  .menu-pages {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* One after the other, rising into place. */
  .menu-pages li,
  .menu-login,
  .menu-settings {
    animation: public-menu-item 0.45s both cubic-bezier(0.2, 0.7, 0.2, 1);
    animation-delay: calc(0.12s + var(--i, 0) * 0.06s);
  }

  .menu-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 3rem;
    color: var(--color-on-ink);
    font-family: var(--font-display);
    font-size: clamp(1.5rem, 7vw, 2.25rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    text-decoration: none;
  }

  /* The current page: a thick gold underline (not colour alone: the line is the cue). */
  .menu-link[aria-current='page'] {
    text-decoration: underline;
    text-decoration-color: var(--color-accent-fill);
    text-decoration-thickness: 4px;
    text-underline-offset: 0.2em;
  }

  .menu-link:hover {
    text-decoration: underline;
    text-decoration-color: var(--color-accent-fill);
    text-decoration-thickness: 3px;
    text-underline-offset: 0.2em;
  }

  .menu-login {
    justify-content: center;
    min-height: 3.25rem;
    font-size: 1.0625rem;
  }

  .menu-settings {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: auto;
    padding-top: var(--space-5);
    border-top: 1px solid color-mix(in srgb, var(--color-on-ink) 15%, transparent);
  }

  .menu-lang {
    flex: 1;
  }
}

@keyframes public-menu-reveal {
  from {
    clip-path: circle(0 at calc(100% - 3.5rem) 2.75rem);
  }

  to {
    clip-path: circle(150% at calc(100% - 3.5rem) 2.75rem);
  }
}

@keyframes public-menu-item {
  from {
    opacity: 0;
    transform: translateY(0.75rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .menu-panel[data-open],
  .menu-pages li,
  .menu-login,
  .menu-settings {
    animation: none;
  }

  .line {
    transition: none;
  }
}
</style>
