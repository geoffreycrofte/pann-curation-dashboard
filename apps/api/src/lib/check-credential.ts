import Anthropic from '@anthropic-ai/sdk'
import type { CredentialStatus, Provider } from '@pann/shared'
import { USER_AGENT } from './fetch-text'

export interface CredentialCheck {
  status: CredentialStatus
  /** Why it is not "ok": invalid_key, provider_unreachable, no_free_check. */
  detail: string | null
}

/**
 * Checks a key with a free, read-only call to the provider. Exa has no free endpoint:
 * its key is checked on first use by the collector.
 */
export async function checkCredential(
  provider: Provider,
  secret: string,
): Promise<CredentialCheck> {
  try {
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
