import {
  DEFAULT_DIGEST_DAYS,
  errorCode,
  lastDigestTime,
  renderDigest,
  type Lang,
  type TopicConfig,
} from '@pann/shared'
import type { Campaign, CampaignResult } from './brevo'
import type { DigestContent } from './content'

export interface DigestTopic {
  id: string
  workspace_id: string
  slug: string
  name_fr: string
  name_en: string
  config: TopicConfig
}

export interface IssueRow {
  topic_id: string
  lang: Lang
  period_from: Date
  period_to: Date
  status: 'scheduled' | 'failed' | 'skipped'
  subject?: string
  item_count?: number
  last_error?: string
}

export interface IssuePatch {
  status: 'sent' | 'failed'
  external_id?: string
  last_error?: string | null
  sent_at?: Date
}

export interface DigestStore {
  /** Active topics; one topic when `topicId` is given. */
  topics(topicId?: string): Promise<DigestTopic[]>
  issueExists(topicId: string, lang: Lang, periodTo: Date): Promise<boolean>
  lastIssueEnd(topicId: string, lang: Lang): Promise<Date | null>
  content(q: {
    topicId: string
    workspaceId: string
    lang: Lang
    from: Date
    to: Date
  }): Promise<DigestContent>
  brevoKey(workspaceId: string): Promise<string | undefined>
  /** Null when this issue already exists (another run took it). */
  createIssue(row: IssueRow): Promise<string | null>
  updateIssue(id: string, patch: IssuePatch): Promise<void>
  markCredentialInvalid(workspaceId: string): Promise<void>
}

export type SendCampaign = (apiKey: string, campaign: Campaign) => Promise<CampaignResult>

/** A scheduled issue is not sent more than this late (the Worker was down, say). */
const MAX_DELAY_MS = 6 * 3600_000

export interface DigestReport {
  topic_id: string
  lang: Lang
  status: 'sent' | 'failed' | 'skipped'
  error?: string
}

/**
 * Sends the newsletter of each language as a Brevo campaign. `scheduled`: the topics
 * whose weekly time has come and that send automatically; `now`: one topic, from the
 * board. An issue holds the items validated since the end of the last issue sent.
 */
export async function sendDigests(deps: {
  store: DigestStore
  send: SendCampaign
  mode: 'scheduled' | 'now'
  topicId?: string
  langs?: Lang[]
  now?: Date
}): Promise<DigestReport[]> {
  const now = deps.now ?? new Date()
  const reports: DigestReport[] = []
  for (const topic of await deps.store.topics(deps.topicId)) {
    const { config } = topic
    let periodTo = now
    if (deps.mode === 'scheduled') {
      if (!config.newsletter.auto_send) continue
      periodTo = lastDigestTime(config.schedule, now)
      if (now.getTime() - periodTo.getTime() > MAX_DELAY_MS) continue
    }
    const langs = config.output_langs.filter((l) => !deps.langs || deps.langs.includes(l))
    for (const lang of langs) {
      if (deps.mode === 'scheduled' && (await deps.store.issueExists(topic.id, lang, periodTo)))
        continue
      reports.push(await sendIssue(deps, topic, lang, periodTo))
    }
  }
  return reports
}

async function sendIssue(
  deps: { store: DigestStore; send: SendCampaign },
  topic: DigestTopic,
  lang: Lang,
  periodTo: Date,
): Promise<DigestReport> {
  const { store } = deps
  const { newsletter, schedule } = topic.config
  const from =
    (await store.lastIssueEnd(topic.id, lang)) ??
    new Date(periodTo.getTime() - DEFAULT_DIGEST_DAYS * 24 * 3600_000)
  const base = { topic_id: topic.id, lang, period_from: from, period_to: periodTo }
  const stop = async (status: 'failed' | 'skipped', error: string): Promise<DigestReport> => {
    await store.createIssue({ ...base, status, last_error: error })
    return { topic_id: topic.id, lang, status, error }
  }

  const listId = newsletter.lists[lang]
  if (!listId || !newsletter.sender_id)
    return stop('failed', errorCode('newsletter_not_configured', lang))
  const content = await store.content({
    topicId: topic.id,
    workspaceId: topic.workspace_id,
    lang,
    from,
    to: periodTo,
  })
  if (!content.items.length) return stop('skipped', 'empty_digest')
  const apiKey = await store.brevoKey(topic.workspace_id)
  if (!apiKey) return stop('failed', errorCode('missing_credential', 'brevo'))

  const { subject, html } = renderDigest({
    lang,
    title: (lang === 'fr' ? newsletter.title_fr : newsletter.title_en) || topic[`name_${lang}`],
    intro: lang === 'fr' ? newsletter.intro_fr : newsletter.intro_en,
    items: content.items,
    date: periodTo,
    timezone: schedule.timezone,
  })
  const id = await store.createIssue({
    ...base,
    status: 'scheduled',
    subject,
    item_count: content.items.length,
  })
  if (!id) return { topic_id: topic.id, lang, status: 'skipped', error: 'already_sent' }

  const result = await deps.send(apiKey, {
    name: `Pann ${topic.slug} ${lang} ${periodTo.toISOString().slice(0, 10)}`,
    subject,
    senderId: newsletter.sender_id,
    listId,
    html,
  })
  if (result.ok) {
    await store.updateIssue(id, {
      status: 'sent',
      external_id: String(result.campaignId),
      last_error: null,
      sent_at: new Date(),
    })
    return { topic_id: topic.id, lang, status: 'sent' }
  }
  if (result.invalidCredential) await store.markCredentialInvalid(topic.workspace_id)
  await store.updateIssue(id, {
    status: 'failed',
    last_error: result.error,
    ...(result.campaignId ? { external_id: String(result.campaignId) } : {}),
  })
  return { topic_id: topic.id, lang, status: 'failed', error: result.error }
}
