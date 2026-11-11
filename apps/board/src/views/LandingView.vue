<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import LandingFigure from '../components/LandingFigure.vue'
import PannMark from '../components/PannMark.vue'
import { setLang } from '../i18n'
import { ILLUSTRATIONS } from '../lib/landing-images'

const { t, tm, rt, locale } = useI18n()

watchEffect(() => (document.title = t('landing.title')))

const otherLang = computed(() => (locale.value === 'fr' ? 'en' : 'fr'))

/** The way from the river to the showcase: who does each step is part of the message. */
const STEPS = [
  { key: 'collect', who: 'pann' },
  { key: 'triage', who: 'pann' },
  { key: 'keep', who: 'you' },
  { key: 'draft', who: 'pann' },
  { key: 'share', who: 'pann' },
] as const

const points = computed(() =>
  (tm('landing.engagement.points') as unknown[]).map((p) => rt(p as string)),
)
const more = computed(() =>
  (tm('landing.more.items') as { term: unknown; desc: unknown }[]).map((item) => ({
    term: rt(item.term as string),
    desc: rt(item.desc as string),
  })),
)

const HALF = '(min-width: 56rem) 40vw, 92vw'
</script>

<template>
  <div class="landing">
    <header class="top">
      <RouterLink to="/" class="brand">
        <PannMark :size="40" />
        <span class="brand-name">{{ t('app.name') }}</span>
      </RouterLink>
      <nav :aria-label="t('landing.nav')" class="top-nav">
        <a href="#how" class="top-link">{{ t('landing.how') }}</a>
        <button
          type="button"
          class="top-link lang"
          :lang="otherLang"
          :aria-label="t('landing.otherLangLabel')"
          @click="setLang(otherLang)"
        >
          {{ t('landing.otherLang') }}
        </button>
        <RouterLink :to="{ name: 'login' }" class="button" data-variant="primary">
          {{ t('landing.login') }}
        </RouterLink>
      </nav>
    </header>

    <main id="main" tabindex="-1">
      <!-- Hero: the pan lifted, the nugget shining. The one animated moment of the page. -->
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-text">
          <h1 id="hero-title" tabindex="-1">{{ t('landing.hero.title') }}</h1>
          <p class="lead">{{ t('landing.hero.lead') }}</p>
          <div class="actions">
            <RouterLink :to="{ name: 'login' }" class="button big" data-variant="primary">
              {{ t('landing.login') }}
            </RouterLink>
            <a href="#how" class="button big">{{ t('landing.how') }}</a>
          </div>
          <p class="invite">{{ t('landing.hero.invite') }}</p>
        </div>
        <LandingFigure
          class="hero-figure"
          :image="ILLUSTRATIONS.hero"
          :alt="t('landing.hero.alt')"
          sizes="(min-width: 56rem) 34rem, 80vw"
          eager
        >
          <span class="sparkle" aria-hidden="true"></span>
          <span class="grains" aria-hidden="true"><i></i><i></i><i></i></span>
        </LandingFigure>
      </section>

      <!-- The problem, on ink. -->
      <section class="band ink problem" aria-labelledby="problem-title">
        <div class="split">
          <LandingFigure
            :image="ILLUSTRATIONS.empty"
            :alt="t('landing.problem.alt')"
            :sizes="HALF"
          />
          <div class="copy">
            <h2 id="problem-title" class="display">{{ t('landing.problem.title') }}</h2>
            <p class="body">{{ t('landing.problem.text') }}</p>
          </div>
        </div>
      </section>

      <!-- The way: a sluice channel runs along the steps and fills with gold as you scroll. -->
      <section id="how" class="band paper" aria-labelledby="how-title" tabindex="-1">
        <div class="section-head">
          <h2 id="how-title" class="display">{{ t('landing.steps.title') }}</h2>
          <p class="body">{{ t('landing.steps.intro') }}</p>
        </div>
        <ol class="steps">
          <li v-for="(step, index) in STEPS" :key="step.key" class="step" :data-who="step.who">
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
              :alt="t(`landing.steps.${step.key}.alt`)"
              sizes="(min-width: 56rem) 26rem, 80vw"
            />
          </li>
        </ol>
      </section>

      <!-- Newsletter, on bright gold. -->
      <section class="band gold" aria-labelledby="newsletter-title">
        <div class="split reverse">
          <LandingFigure
            :image="ILLUSTRATIONS.newsletter"
            :alt="t('landing.newsletter.alt')"
            :sizes="HALF"
          />
          <div class="copy">
            <h2 id="newsletter-title" class="display">{{ t('landing.newsletter.title') }}</h2>
            <p class="body">{{ t('landing.newsletter.text') }}</p>
          </div>
        </div>
      </section>

      <!-- Engagement, on olive: no illustration, a conversation as Pann shows it. -->
      <section class="band olive" aria-labelledby="engagement-title">
        <div class="split">
          <div class="copy">
            <h2 id="engagement-title" class="display">{{ t('landing.engagement.title') }}</h2>
            <p class="body">{{ t('landing.engagement.text') }}</p>
            <ul class="nuggets">
              <li v-for="point in points" :key="point">{{ point }}</li>
            </ul>
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

      <!-- Budget, back on sand. -->
      <section class="band paper" aria-labelledby="budget-title">
        <div class="split">
          <LandingFigure
            :image="ILLUSTRATIONS.budget"
            :alt="t('landing.budget.alt')"
            :sizes="HALF"
          />
          <div class="copy">
            <h2 id="budget-title" class="display">{{ t('landing.budget.title') }}</h2>
            <p class="body">{{ t('landing.budget.text') }}</p>
          </div>
        </div>
      </section>

      <section class="band surface" aria-labelledby="more-title">
        <h2 id="more-title" class="display small">{{ t('landing.more.title') }}</h2>
        <dl class="more">
          <div v-for="item in more" :key="item.term" class="more-item">
            <dt>{{ item.term }}</dt>
            <dd>{{ item.desc }}</dd>
          </div>
        </dl>
      </section>

      <section class="band ink cta" aria-labelledby="cta-title">
        <h2 id="cta-title" class="display huge">{{ t('landing.cta.title') }}</h2>
        <p class="body">{{ t('landing.cta.text') }}</p>
        <RouterLink :to="{ name: 'login' }" class="button big" data-variant="primary">
          {{ t('landing.login') }}
        </RouterLink>
      </section>
    </main>

    <footer class="foot">
      <PannMark :size="32" />
      <p>{{ t('landing.footer') }}</p>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  --gutter: clamp(1rem, 5vw, 4rem);
  --measure: 34rem;

  background: var(--color-paper);
  color: var(--color-text);
}

main:focus {
  outline: none;
}

/* ---------------------------------------------------------------- top bar */
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3) var(--space-6);
  max-width: 80rem;
  margin: 0 auto;
  padding: var(--space-5) var(--gutter);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text);
  text-decoration: none;
}

.brand-name {
  font-family: var(--font-display);
  font-size: 1.625rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.top-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-5);
}

.top-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-text);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.25em;
  cursor: pointer;
}

.top-link:hover {
  text-decoration-thickness: 3px;
}

/* ---------------------------------------------------------------- type */
h1,
.display {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  letter-spacing: -0.035em;
  text-wrap: balance;
}

h1 {
  font-size: clamp(3rem, 7vw, 6rem);
  line-height: 0.92;
}

.display {
  max-width: 18ch;
  font-size: clamp(2.125rem, 5vw, 3.75rem);
  line-height: 1;
}

.display.small {
  font-size: clamp(1.75rem, 3.5vw, 2.5rem);
}

.display.huge {
  max-width: 16ch;
  font-size: clamp(2.5rem, 7vw, 5.5rem);
  line-height: 0.95;
}

.body,
.lead {
  max-width: var(--measure);
  margin: 0;
  font-size: 1.125rem;
  line-height: 1.6;
  text-wrap: pretty;
}

.lead {
  font-size: clamp(1.125rem, 1.6vw, 1.3125rem);
}

.landing a.button {
  text-decoration: none;
}

.button.big {
  min-height: 3.25rem;
  padding-inline: var(--space-6);
  font-size: 1.0625rem;
}

/* ---------------------------------------------------------------- hero */
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  align-items: center;
  gap: var(--space-8) clamp(2rem, 5vw, 5rem);
  max-width: 80rem;
  margin: 0 auto;
  padding: clamp(1rem, 4vw, 3rem) var(--gutter) clamp(3rem, 8vw, 6rem);
}

.hero-text {
  display: grid;
  gap: var(--space-6);
  justify-items: start;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.invite {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

/* In sand sections the plate is the page: no visible frame in the light theme. */
.hero-figure {
  max-width: 34rem;
  justify-self: center;
  border-radius: 3rem;
}

/* The nugget catches the light; grains of sand fall from the rim of the pan. */
.sparkle {
  position: absolute;
  top: 53.5%;
  left: 63.5%;
  width: 9%;
  aspect-ratio: 1;
  background:
    radial-gradient(circle, #fff 0 12%, transparent 13%),
    conic-gradient(
      from 45deg,
      transparent 0 20deg,
      rgb(255 255 255 / 0.95) 45deg,
      transparent 70deg 110deg,
      rgb(255 255 255 / 0.95) 135deg,
      transparent 160deg 200deg,
      rgb(255 255 255 / 0.95) 225deg,
      transparent 250deg 290deg,
      rgb(255 255 255 / 0.95) 315deg,
      transparent 340deg
    );
  border-radius: 50%;
  mask: radial-gradient(circle, #000 35%, transparent 70%);
  opacity: 0;
  animation: twinkle 3.2s ease-in-out 0.6s infinite;
}

.grains {
  position: absolute;
  top: 63.5%;
  left: 69%;
  width: 6%;
  height: 10%;
}

.grains i {
  position: absolute;
  top: 0;
  width: 0.3rem;
  aspect-ratio: 1;
  border-radius: 50%;
  background: #b98f4e;
  opacity: 0;
  animation: fall 2.4s ease-in infinite;
}

.grains i:nth-child(1) {
  left: 10%;
}

.grains i:nth-child(2) {
  left: 45%;
  animation-delay: 0.8s;
}

.grains i:nth-child(3) {
  left: 75%;
  animation-delay: 1.6s;
}

@keyframes twinkle {
  0%,
  55%,
  100% {
    opacity: 0;
    transform: scale(0.4) rotate(0deg);
  }

  70% {
    opacity: 1;
    transform: scale(1) rotate(25deg);
  }
}

@keyframes fall {
  0% {
    opacity: 0;
    transform: translateY(0);
  }

  15% {
    opacity: 0.9;
  }

  100% {
    opacity: 0;
    transform: translateY(5rem);
  }
}

/* ---------------------------------------------------------------- bands */
.band {
  padding: clamp(4rem, 10vw, 8rem) var(--gutter);
}

.band > * {
  max-width: 72rem;
  margin-inline: auto;
}

.paper {
  background: var(--color-paper);
}

.surface {
  background: var(--color-surface);
}

/* Inverted bands: their own text, link and focus colors. */
.ink {
  --color-focus: var(--color-focus-on-ink);

  background: var(--color-ink);
  color: var(--color-on-ink);
}

.gold {
  --color-focus: var(--color-ink);

  background: var(--color-accent-fill);
  color: var(--color-on-accent);
}

.olive {
  --color-focus: var(--color-focus-on-ink);

  background: var(--color-olive);
  color: var(--color-on-olive);
}

.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-8) clamp(2rem, 6vw, 6rem);
}

.split > .plate {
  max-width: 30rem;
  justify-self: center;
}

.split.reverse > .plate {
  order: 2;
}

.copy {
  display: grid;
  gap: var(--space-5);
}

.ink .body {
  color: var(--color-on-ink-muted);
}

/* ---------------------------------------------------------------- steps */
.section-head {
  display: grid;
  gap: var(--space-4);
  margin-bottom: clamp(3rem, 7vw, 5rem);
}

#how:focus {
  outline: none;
}

.steps {
  position: relative;
  display: grid;
  gap: clamp(3rem, 8vw, 6rem);
  margin-block: 0;
  padding: 0;
  list-style: none;
}

/*
 * The sluice channel: a wooden bed under the markers. Gold runs down it, step by
 * step, as each step comes into view (scroll-driven, where supported).
 */
.step {
  --marker: 3.25rem;

  position: relative;
  display: grid;
  grid-template-columns: var(--marker) minmax(0, 1fr) minmax(0, 26rem);
  align-items: center;
  gap: var(--space-6) clamp(1.5rem, 4vw, 4rem);
}

.step::before,
.step::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: calc(-1 * clamp(3rem, 8vw, 6rem));
  left: calc(var(--marker) / 2 - 3px);
  width: 6px;
  border-radius: 3px;
}

.step::before {
  background: color-mix(in srgb, var(--color-wood) 55%, var(--color-paper));
}

.step::after {
  background: var(--color-accent-fill);
  transform-origin: top;
}

.step:last-child::before,
.step:last-child::after {
  bottom: 50%;
}

.step:first-child::before,
.step:first-child::after {
  top: 50%;
}

.marker {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: var(--marker);
  aspect-ratio: 1;
  border: 3px solid var(--color-text);
  border-radius: 50%;
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
  font-family: var(--font-display);
  font-size: 1.375rem;
  font-weight: 800;
}

.step-copy {
  display: grid;
  gap: var(--space-3);
  justify-items: start;
}

.step-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 3.5vw, 2.5rem);
  font-weight: 800;
  letter-spacing: -0.03em;
}

.who {
  margin: 0;
}

.step:nth-child(even) .step-figure {
  grid-row: 1;
  grid-column: 2;
}

.step:nth-child(even) .step-copy {
  grid-row: 1;
  grid-column: 3;
}

@supports (animation-timeline: view()) {
  .step::after {
    animation: pour linear both;
    animation-timeline: view();
    animation-range: entry 60% contain 55%;
  }

  .marker {
    animation: reach linear both;
    animation-timeline: view();
    animation-range: entry 70% contain 30%;
  }
}

@keyframes pour {
  from {
    transform: scaleY(0);
  }

  to {
    transform: scaleY(1);
  }
}

@keyframes reach {
  from {
    background: var(--color-paper);
  }

  to {
    background: var(--color-accent-fill);
  }
}

/* The paper planes keep flying, gently. */
.drift :deep(img) {
  animation: drift 6s ease-in-out infinite;
}

@keyframes drift {
  50% {
    transform: translate(1.5%, -2%);
  }
}

/* ---------------------------------------------------------------- engagement */
.nuggets {
  display: grid;
  gap: var(--space-3);
  max-width: var(--measure);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 1.0625rem;
  line-height: 1.5;
}

.nuggets li {
  display: grid;
  grid-template-columns: 1rem minmax(0, 1fr);
  gap: var(--space-3);
}

/* A small irregular nugget instead of a bullet. */
.nuggets li::before {
  content: '';
  width: 0.9rem;
  height: 0.75rem;
  margin-top: 0.35em;
  border-radius: 55% 45% 50% 40% / 50% 60% 40% 50%;
  background: var(--color-accent-fill);
}

.thread {
  display: grid;
  gap: var(--space-3);
  max-width: 28rem;
  margin: 0;
  justify-self: center;
}

.thread-caption {
  color: var(--color-on-olive-muted);
  font-size: 0.9375rem;
}

.thread-card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 30px 60px rgb(0 0 0 / 0.25);
  transform: rotate(-1.5deg);
}

.thread-card p {
  margin: 0;
}

.thread-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.thread-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 750;
  line-height: 1.25;
}

.thread-score {
  font-weight: 700;
}

.thread-angle {
  color: var(--color-text-muted);
  line-height: 1.5;
}

/* ---------------------------------------------------------------- more */
.more {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr));
  gap: var(--space-8) var(--space-6);
  margin-top: var(--space-8);
  margin-bottom: 0;
}

.more-item {
  display: grid;
  align-content: start;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 4px solid var(--color-accent-fill);
}

.more dt {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 800;
}

.more dd {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.55;
}

/* ---------------------------------------------------------------- cta, footer */
.cta {
  display: grid;
  justify-items: center;
  gap: var(--space-6);
  text-align: center;
}

.cta .display {
  margin-inline: auto;
}

.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-6) var(--gutter) var(--space-8);
  border-top: 1px solid color-mix(in srgb, var(--color-on-ink) 15%, transparent);
  background: var(--color-ink);
  color: var(--color-on-ink-muted);
}

.foot p {
  margin: 0;
}

/* ---------------------------------------------------------------- narrow */
@media (max-width: 56rem) {
  .hero,
  .split {
    grid-template-columns: minmax(0, 1fr);
  }

  .hero-figure {
    max-width: 24rem;
  }

  .split.reverse > .plate {
    order: 0;
  }

  .split > .plate {
    max-width: 22rem;
  }

  .step,
  .step:nth-child(even) {
    grid-template-columns: var(--marker) minmax(0, 1fr);
    align-items: start;
  }

  .step .step-figure,
  .step:nth-child(even) .step-figure {
    grid-row: 2;
    grid-column: 2;
    max-width: 20rem;
  }

  .step:nth-child(even) .step-copy {
    grid-row: 1;
    grid-column: 2;
  }

  .step::before,
  .step::after,
  .step:first-child::before,
  .step:first-child::after {
    top: var(--marker);
  }

  .step:last-child::before,
  .step:last-child::after {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sparkle,
  .grains,
  .drift :deep(img) {
    animation: none;
  }

  .grains {
    display: none;
  }

  .step::after,
  .marker {
    animation: none;
  }
}

@media (forced-colors: active) {
  .marker {
    border-color: CanvasText;
  }

  .step::after {
    background: Highlight;
  }

  .thread-card {
    border: 1px solid CanvasText;
  }
}
</style>
