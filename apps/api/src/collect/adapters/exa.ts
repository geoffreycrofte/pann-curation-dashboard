import { z } from 'zod'
import { SourceError, type Adapter } from '../types'

/** https://exa.ai/docs/reference/search (checked 2026-10-01). */
const EXA_SEARCH_URL = 'https://api.exa.ai/search'

const configSchema = z.object({
  query: z.string().min(1),
  num_results: z.number().int().min(1).max(25).default(10),
  include_domains: z.array(z.string()).optional(),
  exclude_domains: z.array(z.string()).optional(),
  /** Characters of page text kept for triage. */
  max_characters: z.number().int().min(500).max(20_000).default(6000),
})

const responseSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string().nullish(),
      publishedDate: z.string().nullish(),
      text: z.string().nullish(),
    }),
  ),
  costDollars: z.object({ total: z.number() }).partial().nullish(),
})

export const exaAdapter: Adapter = async (source, { since, secrets }) => {
  const key = secrets.exa
  if (!key) throw new SourceError('missing_credential', 'exa')
  const config = configSchema.safeParse(source.config)
  if (!config.success) throw new SourceError('invalid_config')
  const { query, num_results, include_domains, exclude_domains, max_characters } = config.data

  const res = await fetch(EXA_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({
      query,
      type: 'auto',
      numResults: num_results,
      startPublishedDate: since.toISOString(),
      includeDomains: include_domains,
      excludeDomains: exclude_domains,
      contents: { text: { maxCharacters: max_characters } },
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (res.status === 401 || res.status === 403) throw new SourceError('invalid_credential', 'exa')
  if (res.status === 429) throw new SourceError('rate_limited', 'exa')
  if (!res.ok) throw new SourceError('http', res.status)

  const body = responseSchema.safeParse(await res.json())
  if (!body.success) throw new SourceError('provider_response', 'exa')

  return {
    items: body.data.results.map((r) => ({
      url: r.url,
      title: r.title?.trim() || r.url,
      content: r.text ?? null,
      published_at: r.publishedDate ?? null,
      kind: source.default_kind,
    })),
    usage: [
      {
        provider: 'exa',
        operation: 'search',
        units: { searches: 1, results: body.data.results.length },
        cost_usd: body.data.costDollars?.total ?? 0,
      },
    ],
  }
}
