import { isMultiAccount, PROVIDERS, type CredentialMeta, type Provider } from '@pann/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { checkCredential, mastodonInstance } from '../lib/check-credential'
import { blueskyHandle, discordWebhookUrl } from '../publish/direct'
import { parseJson } from '../lib/validation'

const COLUMNS =
  'workspace_id, provider, account, hint, status, status_detail, checked_at, updated_at, meta'
const setBody = z.object({
  secret: z.string().trim().min(8).max(500),
  /** Mastodon only: the instance of the account. */
  instance: z.string().trim().max(200).optional(),
  /** Bluesky only: the handle of the account (the secret is an app password). */
  handle: z.string().trim().max(300).optional(),
})

/**
 * Which account a key belongs to, for the networks with several accounts per workspace:
 * the handle (Bluesky), user@instance (Mastodon, the instance host if it did not answer),
 * the webhook id (Discord). Empty for the other services.
 */
function accountOf(p: Provider, secret: string, meta: CredentialMeta, instance?: string) {
  if (p === 'bluesky') return meta.handle ?? ''
  if (p === 'mastodon') return meta.acct ?? (instance ? new URL(instance).host : '')
  if (p === 'discord') return secret.match(/\/webhooks\/(\d+)\//)?.[1] ?? ''
  return ''
}

const accountQuery = z.object({ account: z.string().max(300).default('') })

function provider(value: string): Provider {
  if (!(PROVIDERS as readonly string[]).includes(value))
    throw new HTTPException(404, { message: 'Unknown provider' })
  return value as Provider
}

/** Mounted under /workspaces/:workspaceId/credentials. Keys are never returned. */
export const credentials = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { data, error } = await c.var.db
      .from('workspace_credentials')
      .select(COLUMNS)
      .eq('workspace_id', c.req.param('workspaceId')!)
    if (error) throw error
    return c.json(data)
  })

  /** Checks the key with the provider (free call), then stores it in Supabase Vault. */
  .put('/:provider', async (c) => {
    const p = provider(c.req.param('provider'))
    const body = await parseJson(setBody, c.req.raw)
    let instance: string | undefined
    if (p === 'mastodon') {
      instance = mastodonInstance(body.instance ?? '') ?? undefined
      if (!instance) throw new HTTPException(422, { message: 'invalid_config' })
    }
    let handle: string | undefined
    if (p === 'bluesky') {
      handle = blueskyHandle(body.handle ?? '') ?? undefined
      if (!handle) throw new HTTPException(422, { message: 'invalid_config' })
    }
    // Discord: the secret is the webhook address; only Discord's own hosts are accepted.
    let secret = body.secret
    if (p === 'discord') {
      secret = discordWebhookUrl(body.secret) ?? ''
      if (!secret) throw new HTTPException(422, { message: 'invalid_config' })
    }
    const check = await checkCredential(p, secret, { instance, handle })
    if (check.status === 'invalid')
      throw new HTTPException(422, { message: `invalid_credential:${p}` })
    const account = accountOf(p, secret, { ...check.meta, handle }, instance)
    if (isMultiAccount(p) && !account) throw new HTTPException(422, { message: 'invalid_config' })

    const { error } = await c.var.db.rpc('set_workspace_credential', {
      p_workspace_id: c.req.param('workspaceId'),
      p_provider: p,
      p_secret: secret,
      p_status: check.status,
      p_status_detail: check.detail,
      p_meta: check.meta ?? {},
      p_account: account,
    })
    if (error?.code === '42501') throw new HTTPException(403, { message: 'owner_only' })
    if (error) throw error

    const { data, error: readError } = await c.var.db
      .from('workspace_credentials')
      .select(COLUMNS)
      .eq('workspace_id', c.req.param('workspaceId')!)
      .eq('provider', p)
      .eq('account', account)
      .single()
    if (readError) throw readError
    return c.json(data)
  })

  /**
   * Reads the Zernio accounts, or the Brevo or SendFox lists (and Brevo senders), again. The key is read
   * by a job (secret key), after RLS has shown that the user is a member.
   */
  .post('/:provider/refresh', async (c) => {
    const workspaceId = c.req.param('workspaceId')!
    const p = provider(c.req.param('provider'))
    if (p !== 'zernio' && p !== 'brevo' && p !== 'sendfox')
      throw new HTTPException(404, { message: 'Nothing to refresh' })
    const { data, error } = await c.var.db
      .from('workspace_credentials')
      .select('provider')
      .eq('workspace_id', workspaceId)
      .eq('provider', p)
      .eq('account', '')
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HTTPException(404, { message: `missing_credential:${p}` })
    await c.env.JOBS.send({ type: 'refresh-credential', workspaceId, provider: p })
    return c.body(null, 202)
  })

  /** Removes a key; `?account=` names which one for the networks with several accounts. */
  .delete('/:provider', async (c) => {
    const query = accountQuery.safeParse(c.req.query())
    if (!query.success) throw new HTTPException(400, { message: 'invalid_config' })
    const { error } = await c.var.db.rpc('delete_workspace_credential', {
      p_workspace_id: c.req.param('workspaceId'),
      p_provider: provider(c.req.param('provider')),
      p_account: query.data.account,
    })
    if (error?.code === '42501') throw new HTTPException(403, { message: 'owner_only' })
    if (error) throw error
    return c.body(null, 204)
  })
