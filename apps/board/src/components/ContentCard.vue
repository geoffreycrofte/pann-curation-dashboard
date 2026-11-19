<script setup lang="ts">
/**
 * The card of one piece of content, with the identity of its type: a publication (from
 * the news watch), a conversation (engagement) or a post of the person's own (Création).
 * Each type has its icon, its accent on the edge and its written name: color is never
 * the only sign. `list` for lists and overviews, `compact` for calendars.
 */
import type { RouteLocationRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

export type ContentKind = 'publication' | 'conversation' | 'creation'

withDefaults(
  defineProps<{
    kind: ContentKind
    title: string
    to?: RouteLocationRaw
    /** External page (opened in a new tab), when there is no page in the board. */
    href?: string
    titleLang?: string
    variant?: 'list' | 'compact'
    headingLevel?: 2 | 3 | 4
  }>(),
  { variant: 'list', headingLevel: 3 },
)
const { t } = useI18n()
const ICON: Record<ContentKind, string> = {
  publication: 'news',
  conversation: 'messages',
  creation: 'writing',
}
</script>

<template>
  <article class="content-card card" :data-kind="kind" :data-variant="variant">
    <span class="kind-icon" aria-hidden="true">
      <Icon :name="ICON[kind]" :size="variant === 'compact' ? 16 : 20" />
    </span>
    <div class="body">
      <p class="kind" :class="{ 'visually-hidden': variant === 'compact' }">
        {{ t(`contentKinds.${kind}`) }}
      </p>
      <component :is="`h${headingLevel}`" class="title" :lang="titleLang">
        <RouterLink v-if="to" :to="to">{{ title }}</RouterLink>
        <a v-else-if="href" :href="href" target="_blank" rel="noopener noreferrer">{{ title }}</a>
        <template v-else>{{ title }}</template>
      </component>
      <div v-if="$slots.meta" class="meta"><slot name="meta" /></div>
      <slot />
      <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
    </div>
  </article>
</template>

<style scoped>
.content-card {
  --kind: var(--color-kind-publication);
  --kind-soft: var(--color-kind-publication-soft);

  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5) var(--space-4) var(--space-4);
  border-inline-start: 4px solid var(--kind);
  transition: box-shadow 0.15s;
}

.content-card:hover {
  box-shadow: var(--shadow-raised);
}

[data-kind='conversation'] {
  --kind: var(--color-kind-conversation);
  --kind-soft: var(--color-kind-conversation-soft);
}

[data-kind='creation'] {
  --kind: var(--color-kind-creation);
  --kind-soft: var(--color-kind-creation-soft);
}

.kind-icon {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: var(--kind-soft);
  color: var(--kind);
}

.body {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.kind {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.title {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 1.0625rem;
  font-weight: 650;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.title a {
  color: var(--color-text);
  text-decoration-color: var(--kind);
}

.meta {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

/* Calendars: tighter, the icon smaller, the type said to screen readers only. */
[data-variant='compact'] {
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3) var(--space-2) var(--space-2);
  border-radius: var(--radius);
}

[data-variant='compact'] .kind-icon {
  width: 1.75rem;
  height: 1.75rem;
}

[data-variant='compact'] .title {
  font-size: 0.9375rem;
}

@media (forced-colors: active) {
  .content-card {
    border-inline-start-color: CanvasText;
  }
}
</style>
