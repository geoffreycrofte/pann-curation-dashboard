import { parseErrorCode, PROVIDERS, type Provider } from '@pann/shared'

type Translate = (key: string, params?: Record<string, unknown>) => string

const OTHER_CODES = ['feed_exists', 'owner_only'] as const

export interface DescribedError {
  text: string
  /** Set when the fix is a key in the Connections page. */
  provider?: Provider
}

/** Turns an error code from the API (e.g. "missing_credential:exa") into a sentence. */
export function describeError(value: string, t: Translate): DescribedError {
  if ((OTHER_CODES as readonly string[]).includes(value)) return { text: t(`errors.${value}`) }
  const parsed = parseErrorCode(value)
  if (!parsed) return { text: value }
  const provider = (PROVIDERS as readonly string[]).includes(parsed.detail ?? '')
    ? (parsed.detail as Provider)
    : undefined
  const text = t(`errors.${parsed.code}`, {
    detail: parsed.detail,
    provider: provider ? t(`connections.providers.${provider}.name`) : parsed.detail,
  })
  const fixable = ['missing_credential', 'invalid_credential', 'rate_limited'].includes(parsed.code)
  return { text, provider: fixable ? provider : undefined }
}
