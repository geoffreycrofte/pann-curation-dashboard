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

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)
}

/**
 * Canonical form of a URL, used as the uniqueness key for items.
 * - http → https, lower-case host, no "www." prefix, no default port
 * - no fragment, no tracking parameters, remaining parameters sorted
 * - no trailing slash (except for the root path)
 */
export function normalizeUrl(input: string): string {
  const url = new URL(input.trim())
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${url.protocol}`)
  }

  url.protocol = 'https:'
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
  if (url.port === '80' || url.port === '443') url.port = ''
  url.hash = ''
  url.username = ''
  url.password = ''

  const kept = [...url.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)))
  url.search = ''
  for (const [name, value] of kept) url.searchParams.append(name, value)

  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')

  const out = url.toString()
  return url.pathname === '/' && !url.search ? out.replace(/\/$/, '') : out
}
