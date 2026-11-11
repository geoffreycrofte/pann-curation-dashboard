import { parseTopicConfig, type Lang } from '@pann/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readBrevoAccount, sendBrevoCampaign } from './brevo'
import { sendDigests, type DigestStore, type IssueRow } from './digest'
import type { Campaign } from './send'
import { readSendfoxAccount, sendSendfoxCampaign } from './sendfox'

const config = parseTopicConfig({
  newsletter: { sender_id: 3, lists: { fr: 10, en: 11 }, title_fr: 'Lede', auto_send: true },
})
const topic = {
  id: 't1',
  workspace_id: 'w1',
  slug: 'a11y',
  name_fr: 'Accessibilité',
  name_en: 'Accessibility',
  config,
}
const item = { title: 'T', url: 'https://e.org/a', summary: 'S', source_lang: 'en' }

function fakeStore(overrides: Partial<DigestStore> = {}) {
  const created: IssueRow[] = []
  const updates: unknown[] = []
  const recorded: [string, string[]][] = []
  const store: DigestStore = {
    topics: async () => [topic],
    issueExists: async () => false,
    lastSentIssueStart: async () => new Date('2026-10-02T06:00:00Z'),
    content: async () => ({ items: [item], item_ids: ['i1'], without_summary: 0 }),
    addIssueItems: async (id, ids) => void recorded.push([id, ids]),
    newsletterKey: async (_workspace, provider) => (provider === 'brevo' ? 'xkeysib-1' : undefined),
    createIssue: async (row) => (created.push(row), `d${created.length}`),
    updateIssue: async (id, patch) => void updates.push([id, patch.status, patch.last_error]),
    markCredentialInvalid: async () => {},
    ...overrides,
  }
  return { store, created, updates, recorded }
}

describe('sendDigests', () => {
  // Friday 9 October 2026, 08:03 in Luxembourg: the weekly time (08:00) has just passed.
  const now = new Date('2026-10-09T06:03:00Z')

  it('sends one campaign per language to the list of that language', async () => {
    const campaigns: Campaign[] = []
    const { store, created, updates, recorded } = fakeStore()
    const reports = await sendDigests({
      store,
      send: async (_provider, _key, c) => (campaigns.push(c), { ok: true, campaignId: 7 }),
      mode: 'scheduled',
      now,
    })
    expect(reports.map((r) => `${r.lang} ${r.status}`)).toEqual(['fr sent', 'en sent'])
    expect(campaigns.map((c) => [c.listId, c.senderId, c.subject])).toEqual([
      [10, 3, 'Lede, 9 octobre 2026'],
      [11, 3, 'Accessibility, October 9, 2026'],
    ])
    expect(created[0]).toMatchObject({
      status: 'scheduled',
      item_count: 1,
      period_from: new Date('2026-10-02T06:00:00Z'),
      period_to: new Date('2026-10-09T06:00:00Z'),
    })
    expect(updates[0]).toEqual(['d1', 'sent', null])
    // The items of the issue are recorded before sending: they will not go out twice.
    expect(recorded).toEqual([
      ['d1', ['i1']],
      ['d2', ['i1']],
    ])
  })

  it('does nothing before the weekly time, nor when automatic sending is off', async () => {
    const { store } = fakeStore()
    const send = vi.fn()
    const early = new Date('2026-10-09T05:50:00Z')
    expect(await sendDigests({ store, send, mode: 'scheduled', now: early })).toEqual([])
    const manual = fakeStore({
      topics: async () => [
        { ...topic, config: { ...config, newsletter: { ...config.newsletter, auto_send: false } } },
      ],
    })
    expect(await sendDigests({ store: manual.store, send, mode: 'scheduled', now })).toEqual([])
    const noCuration = fakeStore({
      topics: async () => [
        { ...topic, config: { ...config, modules: { curation: false, engagement: true } } },
      ],
    })
    expect(await sendDigests({ store: noCuration.store, send, mode: 'scheduled', now })).toEqual([])
    expect(send).not.toHaveBeenCalled()
  })

  it('does not send an issue twice', async () => {
    const { store } = fakeStore({ issueExists: async () => true })
    const send = vi.fn()
    expect(await sendDigests({ store, send, mode: 'scheduled', now })).toEqual([])
  })

  it('records an empty week and a missing list without calling Brevo', async () => {
    const send = vi.fn()
    const empty = fakeStore({
      content: async () => ({ items: [], item_ids: [], without_summary: 2 }),
    })
    const reports = await sendDigests({ store: empty.store, send, mode: 'now', langs: ['fr'], now })
    expect(reports).toEqual([
      { topic_id: 't1', lang: 'fr', status: 'skipped', error: 'empty_digest' },
    ])
    expect(empty.created[0]?.status).toBe('skipped')

    const noList = fakeStore({
      topics: async () => [
        {
          ...topic,
          config: { ...config, newsletter: { ...config.newsletter, lists: { fr: null, en: 11 } } },
        },
      ],
    })
    const [fr] = await sendDigests({
      store: noList.store,
      send,
      mode: 'now',
      langs: ['fr'],
      now,
    })
    expect(fr).toMatchObject({ lang: 'fr' as Lang, error: 'newsletter_not_configured:fr' })
    expect(send).not.toHaveBeenCalled()
  })

  it('reports a Brevo failure on the issue', async () => {
    const { store, updates } = fakeStore()
    await sendDigests({
      store,
      send: async () => ({ ok: false, error: 'credits_exhausted:brevo', campaignId: 7 }),
      mode: 'now',
      langs: ['en'],
      now,
    })
    expect(updates[0]).toEqual(['d1', 'failed', 'credits_exhausted:brevo'])
  })

  it('sends with SendFox when the topic uses it, without a Brevo sender', async () => {
    const sendfox = {
      ...topic,
      config: parseTopicConfig({
        newsletter: { provider: 'sendfox', lists: { fr: 5, en: null }, auto_send: true },
      }),
    }
    const calls: [string, string, Campaign][] = []
    const { store } = fakeStore({
      topics: async () => [sendfox],
      newsletterKey: async (_w, provider) => (provider === 'sendfox' ? 'sf-token' : undefined),
    })
    const [report] = await sendDigests({
      store,
      send: async (provider, key, c) => (
        calls.push([provider, key, c]),
        { ok: true, campaignId: 9 }
      ),
      mode: 'now',
      langs: ['fr'],
      now,
    })
    expect(report).toMatchObject({ lang: 'fr', status: 'sent' })
    expect(calls[0]?.slice(0, 2)).toEqual(['sendfox', 'sf-token'])
    expect(calls[0]?.[2].html).toContain('{{unsubscribe_url}}')
  })

  it('names the service whose key is missing', async () => {
    const { store } = fakeStore({ newsletterKey: async () => undefined })
    const [report] = await sendDigests({ store, send: vi.fn(), mode: 'now', langs: ['fr'], now })
    expect(report?.error).toBe('missing_credential:brevo')
  })
})

describe('SendFox API', () => {
  afterEach(() => vi.unstubAllGlobals())

  function respond(...answers: [number, unknown][]) {
    const requests: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      requests.push({ url, init })
      const [status, body] = answers[Math.min(requests.length, answers.length) - 1]!
      return new Response(JSON.stringify(body), { status })
    })
    return requests
  }

  it('creates a draft campaign for the list, then sends it', async () => {
    const requests = respond([201, { id: 12 }], [200, { id: 12 }])
    const result = await sendSendfoxCampaign('sf-token', {
      name: 'Pann a11y fr',
      subject: 'Lede',
      senderId: null,
      listId: 5,
      html: '<body><a href="{{unsubscribe_url}}">x</a></body>',
    })
    expect(result).toEqual({ ok: true, campaignId: 12 })
    expect(requests.map((r) => r.url)).toEqual([
      'https://api.sendfox.com/campaigns',
      'https://api.sendfox.com/campaigns/12/send',
    ])
    expect(new Headers(requests[0]!.init.headers).get('Authorization')).toBe('Bearer sf-token')
    expect(JSON.parse(requests[0]!.init.body as string)).toMatchObject({
      title: 'Pann a11y fr',
      subject: 'Lede',
      lists: [5],
      web_publish: false,
    })
  })

  it('reports a refused send with the campaign it created', async () => {
    respond([201, { id: 12 }], [403, { message: 'warmup' }])
    expect(
      await sendSendfoxCampaign('sf-token', {
        name: 'n',
        subject: 's',
        senderId: null,
        listId: 5,
        html: '<body></body>',
      }),
    ).toEqual({
      ok: false,
      error: 'provider_response:sendfox',
      campaignId: 12,
      invalidCredential: undefined,
    })
  })

  it('reads the lists of the account and rejects a wrong token', async () => {
    respond(
      [200, { id: 1, email: 'me@example.org' }],
      [200, { data: [{ id: 5, name: 'Lettre FR', subscribed_contacts_count: 80 }], total: 1 }],
    )
    expect(await readSendfoxAccount('sf-token')).toEqual({
      ok: true,
      lists: [{ id: 5, name: 'Lettre FR', subscribers: 80 }],
    })
    respond([401, { message: 'Unauthenticated.' }])
    expect(await readSendfoxAccount('bad')).toEqual({ ok: false, detail: 'invalid_key' })
  })
})

describe('Brevo API', () => {
  afterEach(() => vi.unstubAllGlobals())

  function respond(...answers: [number, unknown][]) {
    const requests: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      requests.push({ url, init })
      const [status, body] = answers[Math.min(requests.length, answers.length) - 1]!
      return new Response(status === 204 ? null : JSON.stringify(body), { status })
    })
    return requests
  }

  it('creates the campaign for the list, then sends it now', async () => {
    const requests = respond([201, { id: 42 }], [204, null])
    const result = await sendBrevoCampaign('xkeysib-1', {
      name: 'Pann a11y fr',
      subject: 'Lede',
      senderId: 3,
      listId: 10,
      html: '<p>Hello, world</p>',
    })
    expect(result).toEqual({ ok: true, campaignId: 42 })
    expect(requests.map((r) => r.url)).toEqual([
      'https://api.brevo.com/v3/emailCampaigns',
      'https://api.brevo.com/v3/emailCampaigns/42/sendNow',
    ])
    expect(new Headers(requests[0]!.init.headers).get('api-key')).toBe('xkeysib-1')
    expect(JSON.parse(requests[0]!.init.body as string)).toEqual({
      name: 'Pann a11y fr',
      subject: 'Lede',
      sender: { id: 3 },
      htmlContent: '<p>Hello, world</p>',
      recipients: { listIds: [10] },
    })
  })

  it('reports missing credits, keeping the created campaign', async () => {
    respond([201, { id: 42 }], [402, { code: 'not_enough_credits' }])
    expect(
      await sendBrevoCampaign('k', { name: 'n', subject: 's', senderId: 1, listId: 1, html: 'h' }),
    ).toEqual({ ok: false, error: 'credits_exhausted:brevo', campaignId: 42 })
  })

  it('reads lists and senders, and tells an unknown IP from a wrong key', async () => {
    respond(
      [200, { lists: [{ id: 10, name: 'Lettre FR', totalSubscribers: 120 }], count: 1 }],
      [200, { senders: [{ id: 3, name: 'Geoffrey', email: 'g@e.org', active: true }] }],
    )
    expect(await readBrevoAccount('k')).toEqual({
      ok: true,
      lists: [{ id: 10, name: 'Lettre FR', subscribers: 120 }],
      senders: [{ id: 3, name: 'Geoffrey', email: 'g@e.org', active: true }],
    })
    respond([
      401,
      {
        code: 'unauthorized',
        message: 'We have detected you are using an unrecognised IP address',
      },
    ])
    expect(await readBrevoAccount('k')).toEqual({ ok: false, detail: 'ip_not_authorized' })
    respond([401, { code: 'unauthorized', message: 'Key not found' }])
    expect(await readBrevoAccount('k')).toEqual({ ok: false, detail: 'invalid_key' })
  })
})
