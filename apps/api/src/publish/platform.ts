import { errorCode, type ZernioAccount, type ZernioChannel } from '@pann/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { USER_AGENT } from '../lib/fetch-text'
import { listZernioAccounts, ZERNIO_API } from './networks'

/**
 * Zernio in platform mode: Pann's own key, one Zernio profile per workspace
 * (externalId = workspace id). Profiles and connection links per docs.zernio.com
 * (guides/profiles, guides/connecting-accounts, connect/get-connect-url; 2026-11-19).
 */

export type ProfileResult = { ok: true; id: string } | { ok: false; error: string }

const headers = (apiKey: string, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${apiKey}`,
  'User-Agent': USER_AGENT,
  ...extra,
})

async function call(url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
  } catch {
    return null
  }
}

const failed = (res: Response | null): string =>
  !res
    ? errorCode('provider_error', 'zernio')
    : res.status === 401 || res.status === 403
      ? errorCode('invalid_credential', 'zernio')
      : res.status === 429
        ? errorCode('rate_limited', 'zernio')
        : errorCode('provider_error', 'zernio')

/** The workspace's profile: found by its externalId, else created (safe to retry). */
export async function ensureProfile(apiKey: string, workspaceId: string): Promise<ProfileResult> {
  const found = await call(`${ZERNIO_API}/profiles?externalId=${encodeURIComponent(workspaceId)}`, {
    headers: headers(apiKey),
  })
  if (!found?.ok) return { ok: false, error: failed(found) }
  const list = (await found.json().catch(() => ({}))) as { profiles?: { _id?: string }[] }
  const existing = list.profiles?.find((p) => p._id)?._id
  if (existing) return { ok: true, id: existing }

  const created = await call(`${ZERNIO_API}/profiles`, {
    method: 'POST',
    headers: headers(apiKey, {
      'Content-Type': 'application/json',
      'Idempotency-Key': `pann-profile-${workspaceId}`,
    }),
    // Names are unique per Zernio team: the workspace id keeps them apart.
    body: JSON.stringify({ name: `Pann ${workspaceId}`, externalId: workspaceId }),
  })
  const body = (await created?.json().catch(() => ({}))) as {
    profile?: { _id?: string }
    details?: { existingProfileId?: string }
  }
  // Created meanwhile by another run: the conflict gives its id.
  if (created?.status === 409 && body.details?.existingProfileId)
    return { ok: true, id: body.details.existingProfileId }
  if (!created?.ok || !body.profile?._id) return { ok: false, error: failed(created) }
  return { ok: true, id: body.profile._id }
}

/**
 * Zernio's authorization address for one network: the person signs in there, picks the
 * Page or organization on Zernio's own screen (standard mode), then comes back to
 * `redirectUrl`. Posting and comments only (first comments need comments).
 */
export async function connectUrl(
  apiKey: string,
  platform: ZernioChannel,
  profileId: string,
  redirectUrl: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const query = new URLSearchParams({
    profileId,
    redirect_url: redirectUrl,
    scopes: 'posting,comments',
    welcome: 'true',
    brandName: 'Pann',
  })
  const res = await call(`${ZERNIO_API}/connect/${platform}?${query}`, { headers: headers(apiKey) })
  if (!res?.ok) return { ok: false, error: failed(res) }
  const body = (await res.json().catch(() => ({}))) as { authUrl?: string }
  return body.authUrl?.startsWith('https://')
    ? { ok: true, url: body.authUrl }
    : { ok: false, error: errorCode('provider_response', 'zernio') }
}

interface LinkRow {
  workspace_id: string
  enabled: boolean
  profile_id: string | null
  status: string
  connect_platform: ZernioChannel | null
  redirect_url: string | null
}

/**
 * Job: prepares a connection link (a platform asked) or lists the accounts of the
 * workspace's profile again (none asked). `db` uses the secret key.
 */
export async function runZernioPlatform(db: SupabaseClient, workspaceId: string) {
  const { data: link, error } = await db
    .from('zernio_platform_links')
    .select('workspace_id, enabled, profile_id, status, connect_platform, redirect_url')
    .eq('workspace_id', workspaceId)
    .maybeSingle<LinkRow>()
  if (error) throw error
  if (!link || !link.enabled || link.status !== 'pending') return 'skipped'
  const finish = async (fields: Record<string, unknown>) => {
    const { error: updateError } = await db
      .from('zernio_platform_links')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
    if (updateError) throw updateError
  }

  const { data: keys, error: keysError } = await db.rpc('platform_credentials_for_jobs')
  if (keysError) throw keysError
  const apiKey = ((keys ?? []) as { provider: string; secret: string }[]).find(
    (k) => k.provider === 'zernio',
  )?.secret
  if (!apiKey) {
    await finish({ status: 'failed', error: errorCode('missing_credential', 'zernio') })
    return 'no_key'
  }

  let profileId = link.profile_id
  if (!profileId) {
    const profile = await ensureProfile(apiKey, workspaceId)
    if (!profile.ok) {
      await finish({ status: 'failed', error: profile.error })
      return profile.error
    }
    profileId = profile.id
    await finish({ profile_id: profileId })
  }

  if (link.connect_platform) {
    if (!link.redirect_url) {
      await finish({ status: 'failed', error: 'unexpected' })
      return 'no_redirect'
    }
    const result = await connectUrl(apiKey, link.connect_platform, profileId, link.redirect_url)
    if (!result.ok) {
      await finish({ status: 'failed', error: result.error })
      return result.error
    }
    await finish({ status: 'idle', connect_url: result.url, error: null })
    return 'link_ready'
  }

  const listed = await listZernioAccounts(apiKey, profileId)
  if (!listed.ok) {
    await finish({
      status: 'failed',
      error: errorCode(listed.invalid ? 'invalid_credential' : 'provider_error', 'zernio'),
    })
    return 'list_failed'
  }
  await finish({
    status: 'idle',
    error: null,
    accounts: listed.accounts satisfies ZernioAccount[],
    refreshed_at: new Date().toISOString(),
  })
  return 'refreshed'
}
