import { errorCode } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Why a job has no key for a service. On a plan where Pann provides the AI and the search,
 * a missing key means the month's token quota (or Pann's own cap) is used up, not a key to
 * set in Connexions. `db` must use the secret key (jobs only).
 */
export async function missingKeyError(
  db: SupabaseClient,
  workspaceId: string,
  provider: string,
): Promise<string> {
  if (provider === 'anthropic' || provider === 'exa') {
    const { data, error } = await db.rpc('workspace_provided_status_for_jobs', {
      p_workspace_id: workspaceId,
    })
    if (error) throw error
    if ((data as { provided: boolean }[] | null)?.[0]?.provided) return 'token_quota_reached'
  }
  return errorCode('missing_credential', provider)
}
