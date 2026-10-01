import type { SourceType } from './domain'

/** External services whose keys are set per workspace, from the board. */
export const PROVIDERS = ['anthropic', 'exa', 'github'] as const
export type Provider = (typeof PROVIDERS)[number]

export const CREDENTIAL_STATUSES = ['unchecked', 'ok', 'invalid'] as const
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number]

export interface WorkspaceCredential {
  workspace_id: string
  provider: Provider
  hint: string
  status: CredentialStatus
  status_detail: string | null
  checked_at: string | null
  updated_at: string
}

export interface ProviderInfo {
  /** required: nothing works without it; source: needed by the sources of that type; optional: improves things. */
  need: 'required' | 'source' | 'optional'
  /** Source type that needs this key, if any. */
  sourceType?: SourceType
  /** Where the key is created (checked 2026-10-01). Help text is in the board translations. */
  url: string
}

export const PROVIDER_INFO: Record<Provider, ProviderInfo> = {
  anthropic: { need: 'required', url: 'https://platform.claude.com/docs/en/get-api-key' },
  exa: { need: 'source', sourceType: 'exa', url: 'https://dashboard.exa.ai/api-keys' },
  github: {
    need: 'optional',
    sourceType: 'github',
    url: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
  },
}

/** Provider whose key a source type needs to run (GitHub works without, but is rate limited). */
export function requiredProvider(type: SourceType): Provider | null {
  return type === 'exa' ? 'exa' : null
}

/**
 * Machine-readable errors stored in sources.last_error and returned by the API
 * (`error` field), translated by the board. Format: "code" or "code:detail".
 */
export const ERROR_CODES = [
  'missing_credential', // :provider
  'invalid_credential', // :provider
  'rate_limited', // :provider
  'provider_response', // :provider (unexpected answer)
  'http', // :status
  'timeout',
  'unreachable',
  'private_address',
  'unsupported_protocol',
  'not_a_feed',
  'no_feed',
  'declared_feed_invalid',
  'invalid_config',
  'unexpected',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export function errorCode(code: ErrorCode, detail?: string | number): string {
  return detail === undefined ? code : `${code}:${detail}`
}

export function parseErrorCode(value: string): { code: ErrorCode; detail?: string } | null {
  const [code, ...rest] = value.split(':')
  if (!(ERROR_CODES as readonly string[]).includes(code ?? '')) return null
  return { code: code as ErrorCode, detail: rest.length ? rest.join(':') : undefined }
}
