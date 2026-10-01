export const USER_AGENT =
  'PannBot/0.1 (content curation; +https://github.com/geoffreycrofte/pann-curation-dashboard)'

export class FetchTextError extends Error {}

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?|\[?f[cd][0-9a-f]*:.*)$/i

export interface FetchedText {
  /** Final URL after redirects. */
  url: string
  contentType: string
  text: string
}

/**
 * Fetches a public web page or feed as text, for user-triggered checks
 * (feed validation, page title). Bounded in time and size.
 */
export async function fetchText(
  input: string,
  { timeoutMs = 8000, maxBytes = 512 * 1024 } = {},
): Promise<FetchedText> {
  const url = new URL(input)
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new FetchTextError('Unsupported protocol')
  if (PRIVATE_HOST.test(url.hostname)) throw new FetchTextError('Private address')

  let res: Response
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5',
      },
    })
  } catch (err) {
    throw new FetchTextError(
      err instanceof Error && err.name === 'TimeoutError' ? 'Timed out' : 'Unreachable',
    )
  }
  if (!res.ok) throw new FetchTextError(`HTTP ${res.status}`)

  const reader = res.body?.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
    if (size >= maxBytes) {
      await reader.cancel()
      break
    }
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return {
    url: res.url || url.toString(),
    contentType: res.headers.get('Content-Type') ?? '',
    // Truncation can cut a multi-byte character: tolerated, we only read metadata.
    text: new TextDecoder().decode(bytes),
  }
}
