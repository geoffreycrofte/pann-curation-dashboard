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
  engagement: { ...raw.engagement, weekly_replies: 3 },
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
    same_story:
      i === 4
        ? { item_id: 'i1', title: 'WCAG 3.0 Working Draft: new conformance model explained' }
        : null,
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
  reply_draft: null,
  reply_status: 'none',
  reply_error: null,
  replied_at: null,
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
// An item still to sort: no drafting yet, the start of its source text to judge it.
const detailNew = {
  ...item(0, 'new'),
  drafted_at: null,
  item: {
    ...item(0, 'new').item,
    excerpt:
      "La direction interministérielle du numérique publie la version 5 du référentiel général d'amélioration de l'accessibilité. Cette version s'aligne sur les WCAG 2.2 et ajoute neuf critères, dont la taille des cibles et l'aide à la saisie.\n\nLa méthode de test est revue : chaque critère indique désormais les outils et les combinaisons d'assistance à utiliser. Les documents bureautiques font l'objet d'un chapitre à part.\n\nLes administrations ont dix-huit mois pour mettre à jour leur déclaration d'accessibilité et publier un schéma pluriannuel qui",
    excerpt_truncated: true,
  },
  summaries: [],
  posts: [],
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
const composition = {
  id: 'c1',
  topic_id: 't1',
  subject: 'Notre audit RGAA en 5 étapes',
  mode: 'notes',
  status: 'draft',
  publish_at: null,
  draft_status: 'idle',
  draft_error: null,
  created_at: h(-30),
  updated_at: h(-2),
  notes:
    "1. Cadrer l'échantillon de pages avec l'équipe.\n2. Tester au clavier et au lecteur d'écran.\n3. Passer les 106 critères.\n4. Rédiger la déclaration d'accessibilité.\n5. Planifier les corrections avec le schéma pluriannuel.",
  link: 'https://example.org/audit-rgaa',
  sources: [],
  channels: ['linkedin', 'bluesky'],
  research_status: 'idle',
  research_error: null,
  media: [
    {
      id: 'm1',
      composition_id: 'c1',
      storage_path: 'w1/c1/m1.webp',
      mime: 'image/webp',
      bytes: 84000,
      width: 1200,
      height: 675,
      position: 0,
      alt: {
        fr: 'Schéma des cinq étapes d’un audit RGAA, de l’échantillon à la déclaration.',
        en: '',
      },
      alt_proposed: ['fr'],
      alt_status: 'idle',
      alt_error: null,
      preview_url:
        'data:image/svg+xml,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="1200" height="675" fill="#f3e3b5"/><g fill="#7a5a00" font-family="sans-serif" font-size="56"><text x="80" y="200">1 Échantillon</text><text x="80" y="300">2 Tests</text><text x="80" y="400">3 Critères</text><text x="80" y="500">4 Déclaration</text><text x="80" y="600">5 Plan</text></g></svg>',
        ),
    },
  ],
  posts: [
    post('cp1', 'linkedin', 'fr'),
    post('cp2', 'linkedin', 'en'),
    { ...post('cp3', 'bluesky', 'fr'), status: 'failed', last_error: 'invalid_credential:bluesky' },
  ],
}
const series = {
  id: 's1',
  topic_id: 't1',
  subject: 'Le RGAA expliqué en une semaine',
  notes: 'Un post par jour, pour les équipes produit qui découvrent le référentiel.',
  post_count: 4,
  span_days: 7,
  plan: [
    {
      subject: 'Pourquoi le RGAA existe',
      angle: 'La loi de 2005 et ce qu’elle impose aux sites publics.',
    },
    { subject: 'Les 13 thématiques', angle: 'Un tour rapide, avec un exemple concret par thème.' },
    { subject: 'Tester sans expert', angle: 'Trois tests à faire soi-même en dix minutes.' },
    {
      subject: 'La déclaration d’accessibilité',
      angle: 'Ce qu’elle doit contenir et où la publier.',
    },
  ],
  status: 'ready',
  error: null,
  created_at: h(-4),
  compositions: [],
}
const routes = {
  '/api/topics/t1/compositions/c1': composition,
  '/api/topics/t1/series/s1': series,
  '/api/me': {
    user: { id: 'u1', email: 'g@example.org' },
    workspaces: [{ role: 'owner', workspace: { id: 'w1', name: 'Perso' } }],
    is_platform_admin: true,
  },
  '/api/topics': [topic, { ...topic, id: 't2', slug: 'glimr', name_fr: 'Glimr', name_en: 'Glimr' }],
  '/api/topics/t1': { ...topic, config, feed_key: 'k' },
  '/api/topics/t1/queue': queue,
  '/api/topics/t2': {
    ...topic,
    id: 't2',
    slug: 'glimr',
    name_fr: 'Glimr',
    name_en: 'Glimr',
    config,
    feed_key: null,
  },
  '/api/topics/t1/items/i1': detail,
  '/api/topics/t1/items/i0': detailNew,
  '/api/workspaces/w1/plan': {
    plan: 'essential',
    max_topics: 3,
    max_social_accounts: 3,
    monthly_tokens: 5000000,
    topics: 1,
    month_tokens: 410000,
    billing_status: 'trialing',
    trial_ends_at: new Date(Date.now() + 9 * 86400000).toISOString(),
    plan_chosen_at: null,
    billing_interval: null,
    current_period_end: null,
    active: true,
    subscribed: false,
  },
  '/api/plans': [
    {
      key: 'own_keys',
      max_topics: 2,
      max_social_accounts: null,
      monthly_tokens: null,
      price_month_eur: null,
      price_year_eur: 24,
      trial_tokens: null,
    },
    {
      key: 'essential',
      max_topics: 3,
      max_social_accounts: 3,
      monthly_tokens: 5000000,
      price_month_eur: 19,
      price_year_eur: 180,
      trial_tokens: 1000000,
    },
    {
      key: 'pro',
      max_topics: 5,
      max_social_accounts: 6,
      monthly_tokens: 15000000,
      price_month_eur: 49,
      price_year_eur: 468,
      trial_tokens: 1000000,
    },
    {
      key: 'custom',
      max_topics: null,
      max_social_accounts: null,
      monthly_tokens: null,
      price_month_eur: null,
      price_year_eur: null,
      trial_tokens: null,
    },
  ],
  '/api/admin/plans': [
    {
      key: 'own_keys',
      max_topics: 2,
      max_social_accounts: null,
      monthly_tokens: null,
      price_month_eur: null,
      price_year_eur: 24,
      trial_tokens: null,
      stripe_price_month: '',
      stripe_price_year: 'price_1Abc',
      updated_at: '2026-11-22',
    },
    {
      key: 'essential',
      max_topics: 3,
      max_social_accounts: 3,
      monthly_tokens: 5000000,
      price_month_eur: 19,
      price_year_eur: 180,
      trial_tokens: 1000000,
      stripe_price_month: 'price_1Def',
      stripe_price_year: 'price_1Ghi',
      updated_at: '2026-11-22',
    },
    {
      key: 'pro',
      max_topics: 5,
      max_social_accounts: 6,
      monthly_tokens: 15000000,
      price_month_eur: 49,
      price_year_eur: 468,
      trial_tokens: 1000000,
      stripe_price_month: '',
      stripe_price_year: '',
      updated_at: '2026-11-22',
    },
    {
      key: 'custom',
      max_topics: null,
      max_social_accounts: null,
      monthly_tokens: null,
      price_month_eur: null,
      price_year_eur: null,
      trial_tokens: null,
      stripe_price_month: '',
      stripe_price_year: '',
      updated_at: '2026-11-22',
    },
  ],
  '/api/admin/access-requests': [
    {
      id: 'r1',
      name: 'Camille Martin',
      email: 'camille@example.org',
      motivation:
        "Je gère la communication d'une association d'accessibilité et je cherche à publier plus régulièrement sur LinkedIn.\nNous sommes trois bénévoles.",
      lang: 'fr',
      status: 'new',
      notified_at: '2026-11-21T10:00:00Z',
      notify_error: null,
      handled_at: null,
      created_at: '2026-11-21T09:58:00Z',
    },
    {
      id: 'r2',
      name: 'Sam Lee',
      email: 'sam@example.org',
      motivation:
        'Indie developer, I want to talk about my open source library without spending hours on it.',
      lang: 'en',
      status: 'accepted',
      notified_at: '2026-11-18T10:00:00Z',
      notify_error: null,
      handled_at: '2026-11-19T10:00:00Z',
      created_at: '2026-11-18T09:58:00Z',
    },
  ],
  '/api/admin/feature-requests': [
    {
      id: 'f1',
      kind: 'network',
      subject: 'Threads',
      status: 'new',
      created_at: '2026-11-20T10:00:00Z',
      workspace: { name: 'Agence' },
    },
  ],
  '/api/admin/workspaces': [
    {
      id: 'w3',
      name: 'geoffrey.crofte',
      created_at: '2026-11-22T10:00:00Z',
      zernio_platform: false,
      accounts: 0,
      owner_email: 'test@example.org',
      plan: 'essential',
      plan_limits: {},
      billing_status: 'trialing',
      billing_interval: null,
      trial_ends_at: new Date(Date.now() + 13.5 * 86400000).toISOString(),
      current_period_end: null,
    },
    {
      id: 'w2',
      name: 'Agence',
      created_at: '2026-11-05T10:00:00Z',
      zernio_platform: true,
      accounts: 3,
      owner_email: 'agence@example.org',
      plan: 'custom',
      plan_limits: { max_topics: 12, monthly_tokens: 40000000 },
      billing_status: 'active',
      billing_interval: 'year',
      trial_ends_at: null,
      current_period_end: '2027-11-05T10:00:00Z',
    },
    {
      id: 'w1',
      name: 'geoffrey.crofte',
      created_at: '2026-10-01T10:00:00Z',
      zernio_platform: false,
      accounts: 0,
      owner_email: 'g@example.org',
      plan: 'own_keys',
      plan_limits: {},
      billing_status: 'legacy',
      billing_interval: null,
      trial_ends_at: null,
      current_period_end: null,
    },
  ],
  '/api/admin/workspace-stats': [
    {
      workspace_id: 'w1',
      workspace_name: 'Perso',
      plan: 'essential',
      plan_limits: {},
      topics: 1,
      calls: 173,
      cost_usd: 3.42,
      platform_cost_usd: 3.42,
      posts_drafted: 54,
      posts_published: 31,
    },
    {
      workspace_id: 'w2',
      workspace_name: 'Agence',
      plan: 'custom',
      plan_limits: { max_topics: 12, monthly_tokens: 40000000 },
      topics: 8,
      calls: 0,
      cost_usd: 0,
      platform_cost_usd: 0,
      posts_drafted: 0,
      posts_published: 0,
    },
  ],
  '/api/topics/t1/usage': {
    budget_usd: 10,
    month_cost_usd: 3.42,
    by_operation: [
      { operation: 'triage', cost_usd: 1.2, calls: 140 },
      { operation: 'draft', cost_usd: 2.22, calls: 18 },
    ],
    posts_drafted: 54,
    posts_published: 31,
    days_elapsed: 21,
    days_in_month: 30,
  },
  '/api/workspaces/w1/credentials': [
    {
      provider: 'anthropic',
      account: '',
      hint: 'x9Qa',
      status: 'ok',
      status_detail: null,
      meta: {},
    },
    {
      provider: 'exa',
      account: '',
      hint: '41f0',
      status: 'invalid',
      status_detail: null,
      meta: {},
    },
    {
      provider: 'zernio',
      account: '',
      hint: 'k2Lm',
      status: 'ok',
      status_detail: null,
      meta: { accounts: [{ id: 'a1', platform: 'linkedin', username: 'Geoffrey', active: true }] },
    },
  ],
}
async function shoot(page, name, path, opts = {}) {
  // A page left open: the clock moves on by this many minutes after loading.
  if (opts.laterMinutes) await page.clock.install()
  await page.goto(base + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  if (opts.laterMinutes) {
    await page.clock.fastForward(opts.laterMinutes * 60_000)
    await page.waitForTimeout(300)
  }
  // Opens a folded part first (the first matching button), and shows it at the top.
  if (opts.click) {
    // A handle, not a locator: the selector stops matching once the button is open.
    const target = await page.locator(opts.click).first().elementHandle()
    // Instant scroll: a smooth one moves the button while the click is aimed at it.
    await target.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await target.click()
    await page.waitForTimeout(300)
    await target.evaluate((el) => el.closest('section')?.scrollIntoView())
  }
  // Types into a field and leaves it, to show the automatic save.
  if (opts.type) {
    const field = page.locator(opts.type).first()
    await field.click()
    await field.press('End')
    await field.pressSequentially(' Merci.')
    await field.blur()
    await page.waitForTimeout(600)
    await field.evaluate((el) => el.closest('form, section')?.scrollIntoView())
  }
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
    ['item-new', '/t/t1/items/i0'],
    ['engagement', '/t/t1/engagement'],
    ['engagement-validated', '/t/t1/engagement?status=validated'],
    ['engagement-published', '/t/t1/engagement?status=published'],
    ['compose', '/t/t1/compose'],
    ['calendar', '/t/t1/calendar'],
    ['calendar-week', '/t/t1/calendar?view=week'],
    ['calendar-week-later', '/t/t1/calendar?view=week', { laterMinutes: 180 }],
    ['settings-general', '/t/t1/settings'],
    ['settings-sources', '/t/t1/settings?tab=sources'],
    ['settings-sources-conversations', '/t/t1/settings?tab=sources&sub=conversations'],
    [
      'settings-sources-help',
      '/t/t1/settings?tab=sources&sub=conversations',
      { click: 'button.help-tip', viewport: true },
    ],
    ['settings-triage', '/t/t1/settings?tab=triage'],
    ['settings-publishing', '/t/t1/settings?tab=publishing'],
    ['settings-product', '/t/t1/settings?tab=product'],
    ['settings-voice', '/t/t1/settings?tab=voice'],
    ['settings-newsletter', '/t/t1/settings?tab=newsletter'],
    ['settings-feed', '/t/t1/settings?tab=feed'],
    ['settings-conversations', '/t/t1/settings?tab=conversations'],
    ['settings-compose', '/t/t1/settings?tab=compose'],
    ['settings-budget', '/t/t1/settings?tab=budget'],
    ['connections', '/connections'],
    [
      'connections-open',
      '/connections',
      { click: 'button.toggle[aria-expanded="false"]:has-text("Gérer")', viewport: true },
    ],
    ['profile', '/profile'],
    ['profile-workspace', '/profile?tab=workspace&offer=open'],
    ['pricing', '/pricing'],
    ['new-topic-plan', '/topics/new'],
    ['composition', '/t/t1/compose/c1'],
    ['composition-saved', '/t/t1/compose/c1', { type: 'textarea[lang="fr"]', viewport: true }],
    ['series', '/t/t1/series/s1'],
    ['series-new', '/t/t1/series/new'],
    ['admin', '/admin'],
    ['admin-requests', '/admin?tab=requests'],
    ['admin-costs', '/admin?tab=costs'],
    ['admin-offers', '/admin?tab=offers'],
    ['out-home', '/?signedout'],
    ['out-pricing', '/pricing?signedout'],
    ['out-login', '/login?signedout'],
    ['out-legal', '/legal?signedout'],
    ['out-terms', '/terms?signedout'],
    ['out-privacy', '/privacy?signedout'],
    ['out-accessibility', '/accessibility?signedout'],
    ['out-legal-email', '/legal?signedout', { click: 'button.reveal', viewport: true }],
    ['new-topic', '/topics/new'],
    ['adjust-topic', '/t/t1/adjust'],
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
      localStorage.setItem('glimr.lang', 'fr')
      // ?signedout in the address: the page as a visitor sees it.
      if (new URL(location.href).searchParams.has('signedout')) return
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
      localStorage.setItem('glimr.lang', 'fr')
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
      if (p === '/api/topics/t1/conversations') {
        const st = url.searchParams.get('status')
        body =
          st === 'new'
            ? [0, 1, 2].map(conv)
            : st === 'validated'
              ? [
                  {
                    ...conv(0),
                    status: 'validated',
                    reply_status: 'ready',
                    reply_draft:
                      'Dans notre équipe, on lance axe-core dans Playwright à chaque PR : un test par parcours critique (connexion, panier, paiement), et on bloque la fusion sur les violations sérieuses. Le reste (clavier, lecteur d’écran) se vérifie à la main avant chaque version. Je travaille sur un outil d’audit, mais cette recette marche sans lui.',
                  },
                  { ...conv(1), status: 'validated' },
                ]
              : st === 'published'
                ? [{ ...conv(2), status: 'published', replied_at: h(-26) }]
                : []
      }
      if (p === '/api/topics/t1/conversations/replies-week') body = { hackernews: 3, bluesky: 1 }
      if (p === '/api/topics/t1/counts')
        body =
          url.searchParams.get('module') === 'engagement'
            ? { new: 3, validated: 2, published: 1, rejected: 2, archived: 0 }
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
    for (const [name, path, opts] of pages) await shoot(page, `${name}-${label}`, path, opts)
    if (errors.length)
      console.log(label, 'errors', JSON.stringify([...new Set(errors)].slice(0, 5)))
    await ctx.close()
  }
  await browser.close()
  console.log('done', pages.length)
})()
