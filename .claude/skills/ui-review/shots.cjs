// Rich mocked API and screenshots of every board page, desktop and mobile.
// Usage: node .claude/skills/ui-review/shots.cjs .claude/skills/ui-review <board URL> <outDir> [page,page]
const { chromium, devices } = require('playwright')
const fs = require('fs')
const [, , dir, base, out, only] = process.argv
fs.mkdirSync(out, { recursive: true })
const raw = JSON.parse(fs.readFileSync(`${dir}/config.json`, 'utf8'))
const config = {
  ...raw,
  output_langs: ['fr', 'en'],
  modules: { curation: true, engagement: true, compose: true },
  compose: { mode: 'notes', posts_per_day: 1, slots: ['12:00'] },
  channels: [
    { channel: 'linkedin', account_id: 'li', langs: ['fr', 'en'] },
    { channel: 'bluesky', account_id: 'bs', langs: ['fr'] },
  ],
}
const topic = {
  id: 't1',
  workspace_id: 'w1',
  slug: 'a11y',
  name_fr: 'Accessibilité numérique',
  name_en: 'Digital accessibility',
  monthly_budget_usd: 10,
  active: true,
  created_at: '2026-10-01T00:00:00Z',
}
const h = (n) => new Date(Date.now() + n * 3600e3).toISOString()
const titles = [
  ['Le RGAA 5 est publié : ce qui change pour les sites publics', 'legal', 92, 'fr'],
  ['WCAG 3.0 Working Draft: new conformance model explained', 'legal', 88, 'en'],
  ['Axe DevTools 5 ajoute la détection des pièges au clavier', 'tool', 81, 'fr'],
  ['European Accessibility Act: what e-commerce must do by June', 'news', 77, 'en'],
  ['Tutoriel : rendre un carrousel accessible avec ARIA', 'resource', 64, 'fr'],
  ['Screen reader survey 2026 results', 'resource', 58, 'en'],
]
const item = (i, status) => {
  const [title, kind, score, lang] = titles[i % titles.length]
  return {
    item_id: `i${i}`,
    topic_id: 't1',
    relevance_score: score - (i > 5 ? 20 : 0),
    is_commercial: i === 3,
    triage_reason: 'Annonce officielle qui concerne directement le public du thème.',
    draft_status: status === 'validated' ? (i % 2 ? 'ready' : 'pending') : 'none',
    draft_error: null,
    status,
    validated_at: status === 'validated' ? h(-5) : null,
    publish_at: null,
    kind,
    item: {
      canonical_url: `https://example.org/${i}`,
      title,
      source_lang: lang,
      origin: 'rss',
      published_at: h(-30 - i),
      discovered_at: h(-10 - i),
    },
  }
}
const conv = (i) => ({
  item_id: `c${i}`,
  topic_id: 't1',
  status: 'new',
  canonical_url: `https://news.ycombinator.com/item?id=${i}`,
  title: [
    'Ask HN: How do you test accessibility in CI?',
    'Screen readers and SPAs, still a mess?',
    'Best tools for colour contrast audits?',
  ][i % 3],
  excerpt:
    'We have a React app and want to catch accessibility regressions before release. axe-core finds some, but...',
  source_lang: 'en',
  published_at: h(-20),
  discovered_at: h(-5),
  meta: {
    platform: i % 2 ? 'bluesky' : 'hackernews',
    author: 'jdoe',
    points: 42 + i,
    comments: 17,
  },
  relevance_score: 85 - i * 7,
  triage_reason: 'Question directe sur le sujet, réponse utile possible.',
  engagement_decision: 'reply',
  engagement_angle: 'Partager une méthode de test en CI avec axe et Playwright.',
  engagement_risk: ['low', 'medium', 'high'][i % 3],
})
const post = (id, channel, lang, status = 'draft') => ({
  id,
  channel,
  lang,
  body:
    lang === 'fr'
      ? 'Le RGAA 5 est publié. Trois changements à retenir pour les sites publics : la nouvelle méthode de test, les critères sur les documents, et le calendrier de mise en conformité.'
      : 'RGAA 5 is out. Three changes for public websites: the new test method, document criteria, and the compliance timeline.',
  first_comment: null,
  status,
  edited_by_human: false,
  scheduled_at: status === 'scheduled' ? h(20) : null,
  sent_at: null,
  published_url: null,
  last_error: null,
  claimed_at: null,
})
const detail = {
  ...item(1, 'validated'),
  draft_status: 'ready',
  drafted_at: h(-2),
  item: { ...item(0, 'validated').item, excerpt: null },
  summaries: [
    {
      lang: 'fr',
      text: 'La DINUM publie la version 5 du RGAA, alignée sur WCAG 2.2. Elle revoit la méthode de test et ajoute des critères sur les documents bureautiques.',
      edited_by_human: false,
    },
    {
      lang: 'en',
      text: 'DINUM publishes RGAA version 5, aligned with WCAG 2.2. It revises the test method and adds criteria on office documents.',
      edited_by_human: false,
    },
  ],
  posts: [post('p1', 'linkedin', 'fr'), post('p2', 'linkedin', 'en'), post('p3', 'bluesky', 'fr')],
}
const queue = [
  {
    item_id: 'i1',
    status: 'validated',
    publish_at: h(20),
    item: { title: titles[0][0], canonical_url: 'https://e.org/1', source_lang: 'fr' },
    posts: [
      { id: 'p1', channel: 'linkedin', lang: 'fr', status: 'scheduled' },
      { id: 'p2', channel: 'linkedin', lang: 'en', status: 'scheduled' },
    ],
  },
  {
    item_id: 'i2',
    status: 'validated',
    publish_at: h(44),
    item: { title: titles[1][0], canonical_url: 'https://e.org/2', source_lang: 'en' },
    posts: [{ id: 'p3', channel: 'bluesky', lang: 'fr', status: 'scheduled' }],
  },
]
const sources = [
  {
    id: 's1',
    topic_id: 't1',
    module: 'curation',
    type: 'rss',
    label: 'Blog de la DINUM',
    config: { url: 'https://example.org/feed' },
    active: true,
    default_kind: 'legal',
    interval_hours: null,
    last_run_at: h(-3),
    run_requested_at: null,
    last_error: null,
    last_run_stats: {
      collected: 12,
      new_items: 3,
      linked: 3,
      duplicates: 0,
      reopened: 0,
      known: 9,
    },
  },
  {
    id: 's2',
    topic_id: 't1',
    module: 'curation',
    type: 'exa',
    label: 'Recherche : accessibilité web',
    config: { query: 'accessibilité web' },
    active: true,
    default_kind: null,
    interval_hours: null,
    last_run_at: h(-8),
    run_requested_at: null,
    last_error: 'invalid_credential:exa',
    last_run_stats: null,
  },
]
const routes = {
  '/api/me': {
    user: { id: 'u1', email: 'g@example.org' },
    workspaces: [{ role: 'owner', workspace: { id: 'w1', name: 'Perso' } }],
    is_platform_admin: true,
  },
  '/api/topics': [topic, { ...topic, id: 't2', slug: 'pann', name_fr: 'Pann', name_en: 'Pann' }],
  '/api/topics/t1': { ...topic, config, feed_key: 'k' },
  '/api/topics/t1/queue': queue,
  '/api/topics/t2': {
    ...topic,
    id: 't2',
    slug: 'pann',
    name_fr: 'Pann',
    name_en: 'Pann',
    config,
    feed_key: null,
  },
  '/api/topics/t1/items/i1': detail,
  '/api/topics/t1/usage': {
    budget_usd: 10,
    month_cost_usd: 3.42,
    by_operation: [
      { operation: 'triage', cost_usd: 1.2, calls: 140 },
      { operation: 'draft', cost_usd: 2.22, calls: 18 },
    ],
  },
  '/api/workspaces/w1/credentials': [
    { provider: 'anthropic', status: 'ok', meta: {} },
    { provider: 'exa', status: 'invalid', meta: {} },
    { provider: 'zernio', status: 'ok', meta: { accounts: [] } },
  ],
}
async function shoot(page, name, path, opts = {}) {
  await page.goto(base + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  if (opts.scroll) await page.evaluate((y) => scrollTo(0, y), opts.scroll)
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: !opts.viewport })
}
;(async () => {
  const browser = await chromium.launch()
  const pages = [
    ['today', '/'],
    ['overview', '/t/t1'],
    ['curation', '/t/t1/curation'],
    ['curation-validated', '/t/t1/curation?status=validated'],
    ['item', '/t/t1/items/i1'],
    ['engagement', '/t/t1/engagement'],
    ['compose', '/t/t1/compose'],
    ['calendar', '/t/t1/calendar'],
    ['settings-general', '/t/t1/settings'],
    ['settings-sources', '/t/t1/settings?tab=sources'],
    ['settings-triage', '/t/t1/settings?tab=triage'],
    ['settings-publishing', '/t/t1/settings?tab=publishing'],
    ['connections', '/connections'],
    ['profile', '/profile'],
  ].filter(([n]) => !only || only.split(',').includes(n))
  for (const [label, ctxOpts] of [
    ['desk', { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 }],
    ['mob', { ...devices['iPhone 13'], deviceScaleFactor: 1 }],
  ]) {
    const ctx = await browser.newContext({ ...ctxOpts, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript(() => {
      localStorage.setItem(
        'sb-localhost-auth-token',
        JSON.stringify({
          access_token: 'x.eyJzdWIiOiJ1MSJ9.y',
          refresh_token: 'r',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: 'u1',
            email: 'g@example.org',
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: {},
            created_at: '2026-01-01',
          },
        }),
      )
      localStorage.setItem('pann.lang', 'fr')
    })
    await page.route('http://localhost:54321/**', (r) =>
      r.fulfill({ status: 200, body: '{}', contentType: 'application/json' }),
    )
    await page.route('**/api/**', (r) => {
      const url = new URL(r.request().url())
      const p = url.pathname
      let body = routes[p]
      if (p === '/api/topics/t1/items') {
        const st = url.searchParams.get('status')
        body =
          st === 'new'
            ? [0, 1, 2, 3, 4, 5].map((i) => item(i, 'new'))
            : st === 'validated'
              ? [6, 7].map((i) => item(i, 'validated'))
              : []
      }
      if (p === '/api/topics/t1/conversations')
        body = url.searchParams.get('status') === 'new' ? [0, 1, 2].map(conv) : []
      if (p === '/api/topics/t1/counts')
        body =
          url.searchParams.get('module') === 'engagement'
            ? { new: 3, validated: 1, rejected: 2, archived: 0 }
            : { new: 6, validated: 2, rejected: 14, published: 9, archived: 3, scheduled: 2 }
      if (p === '/api/topics/t1/sources')
        body = url.searchParams.get('module') === 'engagement' ? [] : sources
      if (p === '/api/topics/t1/compositions')
        body = [
          {
            id: 'c1',
            subject: 'Notre audit RGAA en 5 étapes',
            mode: 'notes',
            status: 'draft',
            publish_at: null,
            draft_status: 'ready',
            created_at: h(-30),
            updated_at: h(-2),
          },
          {
            id: 'c2',
            subject: 'Webinaire du 3 décembre',
            mode: 'links',
            status: 'scheduled',
            publish_at: h(50),
            draft_status: 'ready',
            created_at: h(-60),
            updated_at: h(-20),
          },
        ]
      if (body === undefined)
        body = p.includes('newsletter') ? { next_at: null, previews: [], issues: [] } : []
      r.fulfill({ status: 200, body: JSON.stringify(body), contentType: 'application/json' })
    })
    for (const [name, path] of pages) await shoot(page, `${name}-${label}`, path)
    if (errors.length)
      console.log(label, 'errors', JSON.stringify([...new Set(errors)].slice(0, 5)))
    await ctx.close()
  }
  await browser.close()
  console.log('done', pages.length)
})()
