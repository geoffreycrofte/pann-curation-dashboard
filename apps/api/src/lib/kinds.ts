import { isTopicKind, KIND_KEY, parseTopicConfig } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

/** A kind key in a request body; checked against the topic kinds by `checkKind`. */
export const kindKey = z.string().regex(KIND_KEY).max(40)

/**
 * Kinds live in the topic config, not in the database: a kind given by the user must
 * be one of the topic's (null means "no kind"). RLS limits the read to the user's topics.
 */
export async function checkKind(
  db: SupabaseClient,
  topicId: string,
  kind: string | null | undefined,
): Promise<void> {
  if (!kind) return
  const { data, error } = await db.from('topics').select('config').eq('id', topicId).maybeSingle()
  if (error) throw error
  if (!data) throw new HTTPException(404, { message: 'Topic not found' })
  if (!isTopicKind(parseTopicConfig(data.config), kind))
    throw new HTTPException(400, { message: 'invalid_config' })
}
