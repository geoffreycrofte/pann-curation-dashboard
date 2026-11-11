import {
  digestLook,
  digestWindowStart,
  LANGS,
  nextDigestTime,
  parseTopicConfig,
  renderDigest,
  type Lang,
} from '@pann/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { parseJson } from '../lib/validation'
import { lastSentIssueStart, loadDigestContent } from '../newsletter/content'

const sendBody = z.object({ lang: z.enum(LANGS).optional() })

const ISSUE_COLUMNS =
  'id, lang, status, subject, item_count, period_from, period_to, sent_at, last_error, created_at'

async function readTopic(c: { var: AppEnv['Variables'] }, topicId: string) {
  const { data, error } = await c.var.db
    .from('topics')
    .select('id, workspace_id, name_fr, name_en, config')
    .eq('id', topicId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new HTTPException(404, { message: 'Topic not found' })
  return { ...data, config: parseTopicConfig(data.config) }
}

/** Mounted under /topics. Reads run with the user's JWT (RLS). */
export const newsletter = new Hono<AppEnv>()
  /**
   * The next issue of each language as it would be sent now (preview), the time of the
   * next automatic issue, and the last issues.
   */
  .get('/:topicId/newsletter', async (c) => {
    const topicId = c.req.param('topicId')
    const topic = await readTopic(c, topicId)
    const { newsletter: settings, schedule } = topic.config
    const now = new Date()

    const previews = await Promise.all(
      topic.config.output_langs.map(async (lang: Lang) => {
        const from = digestWindowStart(
          await lastSentIssueStart(c.var.db, topicId, lang),
          topic.config,
          now,
        )
        const content = await loadDigestContent(c.var.db, {
          topicId,
          workspaceId: topic.workspace_id,
          lang,
          from,
        })
        const { subject, html } = renderDigest({
          lang,
          title: (lang === 'fr' ? settings.title_fr : settings.title_en) || topic[`name_${lang}`],
          intro: lang === 'fr' ? settings.intro_fr : settings.intro_en,
          items: content.items,
          date: now,
          timezone: schedule.timezone,
          preview: true,
          ...digestLook(topic.config, lang),
        })
        return {
          lang,
          period_from: from.toISOString(),
          item_count: content.items.length,
          without_summary: content.without_summary,
          // SendFox sends from the account's default sender: only Brevo needs one here.
          configured:
            !!settings.lists[lang] && (settings.provider === 'sendfox' || !!settings.sender_id),
          subject,
          html,
        }
      }),
    )

    const { data: issues, error } = await c.var.db
      .from('digests')
      .select(ISSUE_COLUMNS)
      .eq('topic_id', topicId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw error

    return c.json({
      auto_send: settings.auto_send,
      next_at: settings.auto_send ? nextDigestTime(schedule, now).toISOString() : null,
      previews,
      issues,
    })
  })

  /** Sends now (job): the items scheduled or published that no issue sent yet, per language. */
  .post('/:topicId/newsletter/send', async (c) => {
    const { lang } = await parseJson(sendBody, c.req.raw)
    const topicId = c.req.param('topicId')
    await readTopic(c, topicId) // RLS: the user has access to this topic
    await c.env.JOBS.send({ type: 'send-digest', topicId, lang })
    return c.body(null, 202)
  })
