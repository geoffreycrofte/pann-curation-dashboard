import { DRAFT_CHANNELS, LANGS, parseErrorCode, PROVIDERS, type Provider } from '@pann/shared'

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
  // Diffusion errors carry "channel" or "channel/lang"; newsletter errors, "lang".
  const parts = (parsed.detail ?? '').split('/')
  const [channel, lang] =
    parts.length === 1 && (LANGS as readonly string[]).includes(parts[0]!)
      ? [undefined, parts[0]]
      : parts
  const params = {
    detail: parsed.detail,
    provider: provider ? t(`connections.providers.${provider}.name`) : parsed.detail,
    channel: (DRAFT_CHANNELS as readonly string[]).includes(channel ?? '')
      ? t(`draft.channels.${channel}`)
      : channel,
    lang: (LANGS as readonly string[]).includes(lang ?? '') ? t(`draft.langs.${lang}`) : lang,
  }
  let key = `errors.${parsed.code}`
  if (parsed.code === 'provider_error' && provider) key = 'errors.providerErrorNamed'
  if (parsed.code === 'channel_not_configured' && !parsed.detail) key = 'errors.noChannel'
  const text = t(key, params)
  if (parsed.code === 'account_disconnected') return { text, provider: 'zernio' }
  const fixable = ['missing_credential', 'invalid_credential', 'rate_limited'].includes(parsed.code)
  return { text, provider: fixable ? provider : undefined }
}
