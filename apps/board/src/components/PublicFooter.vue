<script setup lang="ts">
/**
 * Footer of the public pages: what Glimr is, the product and information links, the other
 * language, and who operates the service (as registered).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { setLang } from '../i18n'
import { OPERATOR } from '../legal/types'
import GlimrLogo from './GlimrLogo.vue'

const { t, locale } = useI18n()
const otherLang = computed(() => (locale.value === 'fr' ? 'en' : 'fr'))
const year = new Date().getFullYear()

const PRODUCT = [
  { to: { name: 'home' }, key: 'home' },
  { to: { name: 'how-it-works' }, key: 'how' },
  { to: { name: 'pricing' }, key: 'pricing' },
  { to: { name: 'request-access' }, key: 'requestAccess' },
  { to: { name: 'login' }, key: 'login' },
] as const
const INFORMATION = [
  { to: { name: 'legal' }, key: 'legal' },
  { to: { name: 'terms' }, key: 'terms' },
  { to: { name: 'privacy' }, key: 'privacy' },
  { to: { name: 'accessibility' }, key: 'accessibility' },
] as const
</script>

<template>
  <footer class="public-footer">
    <div class="foot-grid">
      <div class="foot-about">
        <RouterLink to="/" class="foot-brand">
          <GlimrLogo :height="30" />
        </RouterLink>
        <p>{{ t('public.footer.about') }}</p>
        <button
          type="button"
          class="foot-lang"
          :lang="otherLang"
          :aria-label="t('landing.otherLangLabel')"
          @click="setLang(otherLang)"
        >
          {{ t('landing.otherLang') }}
        </button>
      </div>
      <nav aria-labelledby="foot-product">
        <h2 id="foot-product" class="foot-title">{{ t('public.footer.product') }}</h2>
        <ul>
          <li v-for="link in PRODUCT" :key="link.key">
            <RouterLink :to="link.to">{{ t(`public.footer.links.${link.key}`) }}</RouterLink>
          </li>
        </ul>
      </nav>
      <nav aria-labelledby="foot-information">
        <h2 id="foot-information" class="foot-title">{{ t('public.footer.information') }}</h2>
        <ul>
          <li v-for="link in INFORMATION" :key="link.key">
            <RouterLink :to="link.to">{{ t(`public.footer.links.${link.key}`) }}</RouterLink>
          </li>
          <li>
            <!-- The address is shown, protected, in the legal notice. -->
            <RouterLink :to="{ name: 'legal', hash: '#editor' }">{{
              t('public.footer.links.contact')
            }}</RouterLink>
          </li>
        </ul>
      </nav>
    </div>
    <p class="foot-legal">
      {{ t('public.footer.copyright', { year }) }}
      {{
        t('public.footer.operator', {
          name: OPERATOR.name,
          address: OPERATOR.address,
          rcs: OPERATOR.rcs,
          vat: OPERATOR.vat,
        })
      }}
    </p>
  </footer>
</template>

<style scoped>
.public-footer {
  display: grid;
  gap: var(--space-6);
  padding: var(--space-8) clamp(1rem, 5vw, 4rem) var(--space-6);
  background: var(--color-ink);
  color: var(--color-on-ink-muted);
}

.public-footer :focus-visible {
  outline-color: var(--color-focus-on-ink);
}

.foot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
  gap: var(--space-6) var(--space-8);
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
}

@media (min-width: 52rem) {
  .foot-grid {
    grid-template-columns: 2fr 1fr 1fr;
  }
}

.foot-about {
  display: grid;
  align-content: start;
  justify-items: start;
  gap: var(--space-3);
}

.foot-about p {
  max-width: 24rem;
  margin: 0;
}

.foot-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-on-ink);
  font-family: var(--font-display);
  font-size: 1.375rem;
  font-weight: 800;
  text-decoration: none;
}

.foot-title {
  margin: 0 0 var(--space-3);
  color: var(--color-on-ink);
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.public-footer ul {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.public-footer ul a {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  color: var(--color-on-ink);
  text-decoration: none;
  text-underline-offset: 0.25em;
}

.public-footer ul a:hover,
.public-footer ul a[aria-current='page'] {
  text-decoration: underline;
}

.foot-lang {
  min-height: 2.75rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-on-ink);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 0.25em;
  cursor: pointer;
}

.foot-lang:hover {
  text-decoration-thickness: 3px;
}

.foot-legal {
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
  padding-top: var(--space-5);
  border-top: 1px solid color-mix(in srgb, var(--color-on-ink) 15%, transparent);
  font-size: 0.875rem;
}
</style>
