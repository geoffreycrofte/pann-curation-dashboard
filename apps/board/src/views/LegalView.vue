<script setup lang="ts">
/**
 * A legal page (legal notice, terms, privacy, accessibility): its title, the date of its last change, a
 * table of contents, then its sections. French is the binding version: the English one says
 * so and links to it.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LegalBlocks from '../components/LegalBlocks.vue'
import { setLang } from '../i18n'
import en from '../legal/en'
import fr from '../legal/fr'
import type { LegalDoc, LegalDocKey } from '../legal/types'

const props = defineProps<{ doc: LegalDocKey }>()
const { t, locale } = useI18n()

const page = computed<LegalDoc>(() => (locale.value === 'fr' ? fr : en)[props.doc])
const translated = computed(() => locale.value !== 'fr')
</script>

<template>
  <div class="legal">
    <header class="legal-head">
      <h1 tabindex="-1">{{ page.title }}</h1>
      <p class="lead">{{ page.lead }}</p>
      <p class="updated">{{ t('legal.updated', { date: page.updated }) }}</p>
      <p v-if="translated" class="notice notice-inline">
        <span>
          {{ t('legal.translation') }}
          <button type="button" class="link-button" lang="fr" @click="setLang('fr')">
            {{ t('legal.readFrench') }}
          </button>
        </span>
      </p>
    </header>

    <div class="legal-body">
      <nav class="toc" aria-labelledby="toc-title">
        <h2 id="toc-title" class="toc-title">{{ t('legal.toc') }}</h2>
        <ol>
          <li v-for="section in page.sections" :key="section.id">
            <a :href="`#${section.id}`">{{ section.title }}</a>
          </li>
        </ol>
      </nav>

      <article class="legal-article">
        <div v-if="page.intro" class="legal-section">
          <LegalBlocks :blocks="page.intro" />
        </div>
        <section
          v-for="section in page.sections"
          :key="section.id"
          :aria-labelledby="section.id"
          class="legal-section"
        >
          <h2 :id="section.id">{{ section.title }}</h2>
          <LegalBlocks :blocks="section.blocks" />
        </section>
        <footer v-if="page.outro" class="legal-outro">
          <LegalBlocks :blocks="page.outro" />
        </footer>
      </article>
    </div>
  </div>
</template>

<style scoped>
/* Signed out, the page brings its own margins (the board's main has them). */
:global(main.public .legal) {
  padding: var(--space-6) clamp(var(--space-4), 4vw, 3.5rem) 4rem;
}

.legal {
  display: grid;
  gap: var(--space-8);
  max-width: 72rem;
  margin: 0 auto;
}

.legal-head {
  display: grid;
  gap: var(--space-3);
  max-width: 44rem;
}

.legal-head h1 {
  margin: 0;
  font-size: clamp(2.25rem, 5vw, 3.25rem);
}

.lead {
  margin: 0;
  font-size: 1.1875rem;
}

.updated {
  margin: 0;
  color: var(--color-text-muted);
}

.link-button {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 650;
  text-decoration: underline;
  text-underline-offset: 0.2em;
  cursor: pointer;
}

/* The contents beside the text on a wide screen, above it otherwise. */
.legal-body {
  display: grid;
  gap: var(--space-8);
  align-items: start;
}

@media (min-width: 60rem) {
  .legal-body {
    grid-template-columns: 16rem minmax(0, 44rem);
  }

  .toc {
    position: sticky;
    top: var(--space-6);
  }
}

.toc {
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.toc-title {
  margin: 0 0 var(--space-3);
  color: var(--color-text-muted);
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.toc ol {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.toc a {
  display: block;
  color: var(--color-text);
  font-size: 0.9375rem;
  text-decoration: none;
}

.toc a:hover {
  text-decoration: underline;
}

.legal-article {
  display: grid;
  gap: var(--space-8);
}

.legal-section {
  display: grid;
  gap: var(--space-3);
  /* A link to the section leaves room above its heading. */
  scroll-margin-top: var(--space-6);
}

.legal-section h2 {
  margin: 0;
  font-size: 1.5rem;
  scroll-margin-top: var(--space-6);
}

.legal-outro {
  padding-top: var(--space-5);
  border-top: 1px solid var(--color-border-subtle);
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}
</style>
