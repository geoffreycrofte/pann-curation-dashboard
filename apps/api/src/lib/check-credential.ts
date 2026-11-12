import Anthropic from '@anthropic-ai/sdk'
import type { CredentialMeta, CredentialStatus, Provider } from '@pann/shared'
import { readBrevoAccount } from '../newsletter/brevo'
import { readSendfoxAccount } from '../newsletter/sendfox'
import { checkBluesky, checkDiscordWebhook } from '../publish/direct'
import { checkMastodon, listZernioAccounts } from '../publish/networks'
import { PRIVATE_HOST, USER_AGENT } from './fetch-text'

export interface CredentialCheck {
  status: CredentialStatus
  /** Why it is not "ok": invalid_key, provider_unreachable, no_free_check. */
  detail: string | null
  /** Not secret, stored with the key: Zernio accounts, Mastodon account. */
  meta?: CredentialMeta
}

/**
 * Base URL of a Mastodon instance typed by the user ("mastodon.social", a profile
 * URL…). Public https hosts only. Null when it is not usable.
 */
export function mastodonInstance(input: string): string | null {
  try {
    const url = new URL(
      /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`,
    )
    if (url.protocol !== 'https:' || PRIVATE_HOST.test(url.hostname) || !url.hostname.includes('.'))
      return null
    return url.origin
  } catch {
    return null
  }
}

/**
 * Checks a key with a free, read-only call to the provider. Exa has no free endpoint:
 * its key is checked on first use by the collector.
 */
export async function checkCredential(
  provider: Provider,
  secret: string,
  options: { instance?: string; handle?: string } = {},
): Promise<CredentialCheck> {
  try {
    if (provider === 'zernio') {
      const result = await listZernioAccounts(secret)
      if (result.ok)
        return {
          status: 'ok',
          detail: null,
          meta: { accounts: result.accounts, refreshed_at: new Date().toISOString() },
        }
      return result.invalid
        ? { status: 'invalid', detail: 'invalid_key' }
        : { status: 'unchecked', detail: 'provider_unreachable', meta: { accounts: [] } }
    }
    if (provider === 'brevo') {
      const result = await readBrevoAccount(secret)
      if (result.ok)
        return {
          status: 'ok',
          detail: null,
          meta: {
            lists: result.lists,
            senders: result.senders,
            refreshed_at: new Date().toISOString(),
          },
        }
      if (result.detail === 'provider_unreachable')
        return { status: 'unchecked', detail: 'provider_unreachable', meta: {} }
      // A key used from an IP that Brevo blocks is not wrong: say so, keep it.
      return result.detail === 'ip_not_authorized'
        ? { status: 'unchecked', detail: 'ip_not_authorized', meta: {} }
        : { status: 'invalid', detail: 'invalid_key' }
    }
    if (provider === 'sendfox') {
      const result = await readSendfoxAccount(secret)
      if (result.ok)
        return {
          status: 'ok',
          detail: null,
          meta: { lists: result.lists, refreshed_at: new Date().toISOString() },
        }
      return result.detail === 'provider_unreachable'
        ? { status: 'unchecked', detail: 'provider_unreachable', meta: {} }
        : { status: 'invalid', detail: 'invalid_key' }
    }
    if (provider === 'bluesky') {
      const result = await checkBluesky(options.handle ?? '', secret)
      if (result.ok)
        return {
          status: 'ok',
          detail: null,
          meta: { handle: result.handle, did: result.did, pds: result.pds },
        }
      return result.invalid
        ? { status: 'invalid', detail: 'invalid_key' }
        : { status: 'unchecked', detail: 'provider_unreachable', meta: { handle: options.handle } }
    }
    if (provider === 'discord') {
      const result = await checkDiscordWebhook(secret)
      if (result.ok)
        return {
          status: 'ok',
          detail: null,
          meta: {
            webhook_name: result.name,
            ...(result.guild_id ? { guild_id: result.guild_id } : {}),
            ...(result.channel_id ? { channel_id: result.channel_id } : {}),
          },
        }
      return result.invalid
        ? { status: 'invalid', detail: 'invalid_key' }
        : { status: 'unchecked', detail: 'provider_unreachable', meta: {} }
    }
    if (provider === 'mastodon') {
      const instance = options.instance ?? ''
      const result = await checkMastodon({ instance, token: secret })
      if (result.ok)
        return {
          status: 'ok',
          detail: null,
          meta: {
            instance,
            acct: result.acct,
            ...(result.max_characters ? { max_characters: result.max_characters } : {}),
          },
        }
      return result.invalid
        ? { status: 'invalid', detail: 'invalid_key' }
        : { status: 'unchecked', detail: 'provider_unreachable', meta: { instance } }
    }
    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey: secret, maxRetries: 0, timeout: 10_000 })
      await client.models.list({ limit: 1 })
      return { status: 'ok', detail: null }
    }
    if (provider === 'github') {
      const res = await fetch('https://api.github.com/rate_limit', {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': USER_AGENT,
          Authorization: `Bearer ${secret}`,
        },
        signal: AbortSignal.timeout(10_000),
      })
      if (res.status === 401) return { status: 'invalid', detail: 'invalid_key' }
      if (!res.ok) return { status: 'unchecked', detail: 'provider_unreachable' }
      return { status: 'ok', detail: null }
    }
    return { status: 'unchecked', detail: 'no_free_check' }
  } catch (err) {
    if (
      err instanceof Anthropic.AuthenticationError ||
      err instanceof Anthropic.PermissionDeniedError
    ) {
      return { status: 'invalid', detail: 'invalid_key' }
    }
    return { status: 'unchecked', detail: 'provider_unreachable' }
  }
}
