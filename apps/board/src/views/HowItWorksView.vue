<script setup lang="ts">
/**
 * How Glimr works: its three tools (news watch, conversations, Création), each with what it
 * brings, how it goes step by step and what separate tool it replaces; then the price of
 * those tools together next to Glimr's. Same visual language as the home page.
 */
import { useI18n } from 'vue-i18n'
import Icon from '../components/Icon.vue'
import LandingFigure from '../components/LandingFigure.vue'
import ToolsCompare from '../components/ToolsCompare.vue'
import { competitorFor, type CompetitorNeed } from '../lib/competitors'
import { ILLUSTRATIONS } from '../lib/landing-images'
import '../styles/marketing.css'

const { t, n } = useI18n()

/** The three tools, their anchor, their icon and what they replace. */
const TOOLS = [
  { key: 'watch', need: 'watch', icon: 'news' },
  { key: 'listen', need: 'listen', icon: 'messages' },
  { key: 'create', need: 'publish', icon: 'send' },
] as const satisfies readonly { key: string; need: CompetitorNeed; icon: string }[]

/** The news watch, from the river to the showcase: who does each step is part of it. */
const WATCH_STEPS = [
  { key: 'collect', who: 'glimr' },
  { key: 'triage', who: 'glimr' },
  { key: 'keep', who: 'you' },
  { key: 'draft', who: 'glimr' },
  { key: 'share', who: 'glimr' },
] as const
const LISTEN_STEPS = ['spot', 'score', 'draft', 'reply'] as const
const CREATE_STEPS = ['start', 'write', 'series', 'images', 'publish'] as const

const replaces = (need: CompetitorNeed) => {
  const c = competitorFor(need)
  return t('howItWorks.replaces', {
    tool: c.tool,
    price: n(c.usd, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: c.usd % 1 ? 2 : 0,
    }),
  })
}
</script>

<template>
  <div class="marketing how">
    <header class="band how-head">
      <div class="how-intro">
        <h1 tabindex="-1">{{ t('howItWorks.title') }}</h1>
        <p class="lead">{{ t('howItWorks.lead') }}</p>
      </div>
      <nav class="tool-nav" :aria-label="t('howItWorks.jump')">
        <ul>
          <li v-for="tool in TOOLS" :key="tool.key">
            <a :href="`#${tool.key}`" class="tool-link">
              <span class="tool-icon" :data-tool="tool.key"
                ><Icon :name="tool.icon" :size="22"
              /></span>
              <span class="tool-link-text">
                <span class="tool-link-name">{{ t(`howItWorks.${tool.key}.name`) }}</span>
                <span class="tool-link-title">{{ t(`howItWorks.${tool.key}.title`) }}</span>
              </span>
            </a>
          </li>
        </ul>
      </nav>
    </header>

    <!-- News watch: the illustrated steps of the sluice, as on the home page before. -->
    <section id="watch" class="band paper tool-band" aria-labelledby="watch-title" tabindex="-1">
      <div class="section-head">
        <p class="eyebrow">
          <Icon name="news" :size="20" />
          {{ t('howItWorks.watch.name') }}
        </p>
        <h2 id="watch-title" class="display">{{ t('howItWorks.watch.title') }}</h2>
        <p class="body">{{ t('howItWorks.watch.text') }}</p>
        <p class="replaces">{{ replaces('watch') }}</p>
      </div>
      <ol class="steps">
        <li v-for="(step, index) in WATCH_STEPS" :key="step.key" class="step" :data-who="step.who">
          <span class="marker" aria-hidden="true">{{ index + 1 }}</span>
          <div class="step-copy">
            <h3 class="step-title">{{ t(`landing.steps.${step.key}.title`) }}</h3>
            <p class="who badge" :data-tone="step.who === 'you' ? 'accent' : undefined" data-dot>
              {{ t(`landing.steps.${step.who}`) }}
            </p>
            <p class="body">{{ t(`landing.steps.${step.key}.text`) }}</p>
          </div>
          <LandingFigure
            class="step-figure"
            :class="{ drift: step.key === 'share' }"
            :image="ILLUSTRATIONS[step.key]"
            on-scene
            :alt="t(`landing.steps.${step.key}.alt`)"
            sizes="(min-width: 56rem) 26rem, 80vw"
          />
        </li>
      </ol>
    </section>

    <!-- Conversations, on olive: the steps, and a thread as Glimr shows it. -->
    <section id="listen" class="band olive tool-band" aria-labelledby="listen-title" tabindex="-1">
      <div class="split">
        <div class="copy">
          <p class="eyebrow">
            <Icon name="messages" :size="20" />
            {{ t('howItWorks.listen.name') }}
          </p>
          <h2 id="listen-title" class="display">{{ t('howItWorks.listen.title') }}</h2>
          <p class="body">{{ t('howItWorks.listen.text') }}</p>
          <p class="replaces">{{ replaces('listen') }}</p>
          <ol class="tool-steps">
            <li v-for="step in LISTEN_STEPS" :key="step">
              <h3>{{ t(`howItWorks.listen.steps.${step}.title`) }}</h3>
              <p>{{ t(`howItWorks.listen.steps.${step}.text`) }}</p>
            </li>
          </ol>
        </div>
        <figure class="thread">
          <figcaption class="thread-caption">{{ t('landing.engagement.example') }}</figcaption>
          <div class="thread-card">
            <p class="thread-meta">
              <span class="badge">{{ t('landing.engagement.examplePlatform') }}</span>
              <span class="badge" data-tone="success" data-dot>{{
                t('landing.engagement.exampleDecision')
              }}</span>
            </p>
            <p class="thread-title" lang="en">{{ t('landing.engagement.exampleTitle') }}</p>
            <p class="thread-score">{{ t('landing.engagement.exampleScore') }}</p>
            <p class="thread-angle">{{ t('landing.engagement.exampleAngle') }}</p>
          </div>
        </figure>
      </div>
    </section>

    <!-- Création, on paper: the nugget on its cushion, then the steps. -->
    <section
      id="create"
      class="band surface tool-band"
      aria-labelledby="create-title"
      tabindex="-1"
    >
      <div class="split reverse">
        <LandingFigure
          :image="ILLUSTRATIONS.draft"
          :alt="t('howItWorks.create.alt')"
          sizes="(min-width: 56rem) 40vw, 92vw"
        />
        <div class="copy">
          <p class="eyebrow">
            <Icon name="send" :size="20" />
            {{ t('howItWorks.create.name') }}
          </p>
          <h2 id="create-title" class="display">{{ t('howItWorks.create.title') }}</h2>
          <p class="body">{{ t('howItWorks.create.text') }}</p>
          <p class="replaces">{{ replaces('publish') }}</p>
          <ol class="tool-steps">
            <li v-for="step in CREATE_STEPS" :key="step">
              <h3>{{ t(`howItWorks.create.steps.${step}.title`) }}</h3>
              <p>{{ t(`howItWorks.create.steps.${step}.text`) }}</p>
            </li>
          </ol>
        </div>
      </div>
    </section>

    <!-- The price of the three separate tools, next to Glimr's. -->
    <section class="band paper compare-band" :aria-label="t('pricing.compare.title')">
      <ToolsCompare />
    </section>

    <section class="band ink cta" aria-labelledby="how-cta-title">
      <h2 id="how-cta-title" class="display huge">{{ t('howItWorks.cta.title') }}</h2>
      <p class="body">{{ t('howItWorks.cta.text') }}</p>
      <div class="actions">
        <RouterLink :to="{ name: 'request-access' }" class="button big" data-variant="primary">
          {{ t('howItWorks.cta.request') }}
        </RouterLink>
        <RouterLink :to="{ name: 'pricing' }" class="button big on-ink">
          {{ t('howItWorks.cta.pricing') }}
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.how-head {
  display: grid;
  gap: var(--space-8);
  padding-top: clamp(1.5rem, 4vw, 3rem);
}

.how-intro,
.tool-nav {
  width: 100%;
}

.how-intro {
  display: grid;
  gap: var(--space-5);
}

/* The three tools at a glance, each a link to its section. */
.tool-nav ul {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tool-link {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  height: 100%;
  padding: var(--space-5);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  text-decoration: none;
  box-shadow: var(--shadow-card);
}

.tool-link:hover {
  border-color: var(--color-accent-fill);
}

.tool-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius);
}

.tool-icon[data-tool='watch'] {
  background: var(--color-neutral-soft);
}

.tool-icon[data-tool='listen'] {
  background: var(--color-kind-conversation-soft);
  color: var(--color-kind-conversation);
}

.tool-icon[data-tool='create'] {
  background: var(--color-kind-publication-soft);
  color: var(--color-kind-publication);
}

.tool-link-text {
  display: grid;
  gap: var(--space-1);
}

.tool-link-name {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 800;
}

.tool-link-title {
  color: var(--color-text-muted);
  line-height: 1.4;
}

/* A link to a tool brings its section to the top; the section itself is not outlined. */
.tool-band {
  scroll-margin-top: var(--space-4);
}

.tool-band:focus {
  outline: none;
}

.tool-steps {
  display: grid;
  gap: var(--space-4);
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
  counter-reset: tool-step;
}

.tool-steps li {
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr);
  gap: var(--space-1) var(--space-3);
  counter-increment: tool-step;
}

.tool-steps li::before {
  content: counter(tool-step);
  display: grid;
  grid-row: span 2;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
  font-family: var(--font-display);
  font-weight: 800;
}

.tool-steps h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 800;
}

.tool-steps p {
  margin: 0;
  line-height: 1.55;
}

.olive .tool-steps p {
  color: var(--color-on-olive-muted);
}

.surface .tool-steps p {
  color: var(--color-text-muted);
}

.compare-band > :deep(*) {
  max-width: 68rem;
}

.cta .actions {
  justify-content: center;
}

/* The neutral button keeps a visible edge on ink. */
.cta .button.on-ink:not([data-variant]) {
  border-color: var(--color-on-ink);
  background: transparent;
  color: var(--color-on-ink);
}
</style>
