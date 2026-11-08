import { githubSourceConfigSchema } from '@pann/shared'
import { z } from 'zod'
import { USER_AGENT } from '../../lib/fetch-text'
import { SourceError, type Adapter } from '../types'

const API = 'https://api.github.com'

const searchSchema = z.object({
  items: z.array(
    z.object({
      full_name: z.string(),
      html_url: z.string(),
      description: z.string().nullish(),
      homepage: z.string().nullish(),
      topics: z.array(z.string()).default([]),
      stargazers_count: z.number(),
      pushed_at: z.string(),
    }),
  ),
})

const releaseSchema = z.object({ tag_name: z.string(), published_at: z.string().nullish() })

function headers(token?: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': USER_AGENT,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function latestRelease(fullName: string, token?: string) {
  const res = await fetch(`${API}/repos/${fullName}/releases/latest`, {
    headers: headers(token),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null // 404: no release
  const body = releaseSchema.safeParse(await res.json())
  return body.success ? body.data : null
}

/**
 * Popular repositories of a topic that were pushed recently. The latest release tag
 * is the change signature: a published tool comes back when it ships a new release.
 */
export const githubAdapter: Adapter = async (source, { since, secrets }) => {
  const config = githubSourceConfigSchema.safeParse(source.config)
  if (!config.success) throw new SourceError('invalid_config')
  const { query, min_stars, max_results } = config.data

  const qualifiers = [query, `pushed:>=${since.toISOString().slice(0, 10)}`]
  if (!/\bstars:/.test(query)) qualifiers.push(`stars:>=${min_stars}`)
  const params = new URLSearchParams({
    q: qualifiers.join(' '),
    sort: 'stars',
    order: 'desc',
    per_page: String(max_results),
  })

  const res = await fetch(`${API}/search/repositories?${params}`, {
    headers: headers(secrets.github),
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 401) throw new SourceError('invalid_credential', 'github')
  // GitHub answers 403 or 429 when the rate limit is exhausted (unauthenticated: 10 searches/min).
  if (res.status === 403 || res.status === 429) throw new SourceError('rate_limited', 'github')
  if (!res.ok) throw new SourceError('http', res.status)
  const body = searchSchema.safeParse(await res.json())
  if (!body.success) throw new SourceError('provider_response', 'github')

  const items = []
  for (const repo of body.data.items) {
    const release = await latestRelease(repo.full_name, secrets.github)
    items.push({
      url: repo.html_url,
      title: repo.description ? `${repo.full_name}: ${repo.description}` : repo.full_name,
      content: [
        repo.description,
        repo.topics.length ? `Topics: ${repo.topics.join(', ')}` : null,
        `Stars: ${repo.stargazers_count}`,
        release ? `Latest release: ${release.tag_name}` : null,
        repo.homepage ? `Homepage: ${repo.homepage}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      published_at: release?.published_at ?? repo.pushed_at,
      kind: source.default_kind,
      change_signature: release?.tag_name ?? null,
    })
  }
  return { items }
}
