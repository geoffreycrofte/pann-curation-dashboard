/** Tracking parameters removed during normalisation (exact names, lower-case). */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'ref',
  'ref_src',
  '_hsenc',
  '_hsmi',
])

/** Parameters that only ask for the AMP version of a page. */
const AMP_PARAMS = new Set(['amp', 'outputtype'])

function isTrackingParam(name: string, value: string): boolean {
  const lower = name.toLowerCase()
  if (AMP_PARAMS.has(lower)) return lower === 'amp' || value.toLowerCase() === 'amp'
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)
}

/**
 * Canonical form of a URL, used as the uniqueness key for items.
 * - http → https, lower-case host, no "www." prefix, no default port
 * - no fragment, no tracking parameters, remaining parameters sorted
 * - no trailing slash (except for the root path)
 * - the same page in another version counts once: no AMP suffix or parameter, no mobile
 *   host ("m.", "mobile."), no "index.html" or "index.php" at the end of the path
 */
export function normalizeUrl(input: string): string {
  const url = new URL(input.trim())
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${url.protocol}`)
  }

  url.protocol = 'https:'
  url.hostname = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '')
  if (url.port === '80' || url.port === '443') url.port = ''
  url.hash = ''
  url.username = ''
  url.password = ''

  const kept = [...url.searchParams.entries()]
    .filter(([name, value]) => !isTrackingParam(name, value))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)))
  url.search = ''
  for (const [name, value] of kept) url.searchParams.append(name, value)

  url.pathname = url.pathname.replace(/\/index\.(html?|php)$/i, '/').replace(/\/amp\/?$/i, '/')
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')

  const out = url.toString()
  return url.pathname === '/' && !url.search ? out.replace(/\/$/, '') : out
}
