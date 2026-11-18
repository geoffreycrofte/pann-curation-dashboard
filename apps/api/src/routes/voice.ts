import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { parseJson } from '../lib/validation'

const newAnalysis = z.object({
  samples: z.string().trim().min(50).max(12_000),
  ui_lang: z.enum(['fr', 'en']).default('fr'),
})

/**
 * Voice from past posts, mounted under /topics: the person asks (RLS: member of the
 * topic), a job proposes rules, the board polls the analysis and offers to apply them.
 */
export const voice = new Hono<AppEnv>()
  .post('/:topicId/voice-analyses', async (c) => {
    const body = await parseJson(newAnalysis, c.req.raw)
    const { data, error } = await c.var.db
      .from('voice_analyses')
      .insert({ topic_id: c.req.param('topicId'), samples: body.samples, ui_lang: body.ui_lang })
      .select('id, status')
      .single()
    if (error) throw error
    await c.env.JOBS.send({ type: 'analyze-voice', analysisId: data.id })
    return c.json(data, 202)
  })

  .get('/:topicId/voice-analyses/:id', async (c) => {
    const { data, error } = await c.var.db
      .from('voice_analyses')
      .select('id, status, result, error')
      .eq('topic_id', c.req.param('topicId'))
      .eq('id', c.req.param('id'))
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: 'Analysis not found' })
    return c.json(data)
  })
