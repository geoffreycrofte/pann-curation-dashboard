<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '../components/Icon.vue'
import LandingFigure from '../components/LandingFigure.vue'
import HeroProspector from '../components/HeroProspector.vue'
import PublicFooter from '../components/PublicFooter.vue'
import PublicHeader from '../components/PublicHeader.vue'
import { competitorFor, type CompetitorNeed } from '../lib/competitors'
import { ILLUSTRATIONS } from '../lib/landing-images'
import '../styles/marketing.css'

const { t, tm, rt, n } = useI18n()

watchEffect(() => (document.title = t('landing.title')))

/** The three tools: their anchor on "how it works", icon, illustration and what they replace. */
const TOOLS = [
  { key: 'watch', need: 'watch', icon: 'news', image: 'keep' },
  { key: 'listen', need: 'listen', icon: 'messages', image: 'triage' },
  { key: 'create', need: 'publish', icon: 'send', image: 'share' },
] as const

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

const points = computed(() =>
  (tm('landing.engagement.points') as unknown[]).map((p) => rt(p as string)),
)
const control = computed(() =>
  (tm('landing.control.points') as unknown[]).map((p) => rt(p as string)),
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
  <div class="landing marketing">
    <PublicHeader />

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
            <RouterLink :to="{ name: 'how-it-works' }" class="button big">
              {{ t('landing.how') }}
            </RouterLink>
            <RouterLink :to="{ name: 'pricing' }" class="button big">
              {{ t('landing.pricing') }}
            </RouterLink>
          </div>
          <p class="invite">{{ t('landing.hero.invite') }}</p>
        </div>
        <HeroProspector
          class="hero-figure"
          on-scene
          :alt="t('landing.hero.alt')"
          sizes="(min-width: 56rem) 34rem, 80vw"
          eager
        />
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

      <!-- The three tools, what each brings, and what it replaces. -->
      <section class="band paper" aria-labelledby="tools-title">
        <div class="section-head">
          <h2 id="tools-title" class="display">{{ t('landing.tools.title') }}</h2>
          <p class="body">{{ t('landing.tools.intro') }}</p>
        </div>
        <ul class="features">
          <li v-for="tool in TOOLS" :key="tool.key" class="feature" :data-tool="tool.key">
            <LandingFigure
              class="feature-figure"
              :image="ILLUSTRATIONS[tool.image]"
              :alt="t(`landing.tools.${tool.key}.alt`)"
              sizes="(min-width: 56rem) 22rem, 80vw"
            />
            <p class="eyebrow">
              <Icon :name="tool.icon" :size="20" />
              {{ t(`howItWorks.${tool.key}.name`) }}
            </p>
            <h3 class="feature-title">{{ t(`landing.tools.${tool.key}.title`) }}</h3>
            <p class="feature-text">{{ t(`landing.tools.${tool.key}.text`) }}</p>
            <p class="replaces">{{ replaces(tool.need) }}</p>
            <RouterLink :to="{ name: 'how-it-works', hash: `#${tool.key}` }" class="feature-more">
              {{ t('howItWorks.detail')
              }}<span class="visually-hidden">{{ t(`howItWorks.${tool.key}.name`) }}</span>
              <Icon name="arrow-right" :size="18" />
            </RouterLink>
          </li>
        </ul>
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

      <!-- Engagement, on olive: no illustration, a conversation as Glimr shows it. -->
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

      <!-- In control: budget, competitors, approval, voice. Back on sand. -->
      <section class="band budget" aria-labelledby="control-title">
        <div class="split">
          <LandingFigure
            on-scene
            :image="ILLUSTRATIONS.budget"
            :alt="t('landing.budget.alt')"
            :sizes="HALF"
          />
          <div class="copy">
            <h2 id="control-title" class="display">{{ t('landing.control.title') }}</h2>
            <p class="body">{{ t('landing.control.text') }}</p>
            <ul class="nuggets">
              <li v-for="point in control" :key="point">{{ point }}</li>
            </ul>
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

    <PublicFooter />
  </div>
</template>
