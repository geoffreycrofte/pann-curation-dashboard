import { z } from 'zod'
import { USER_AGENT } from '../../lib/fetch-text'
import { SourceError, type Adapter } from '../types'

const API = 'https://api.github.com'

const configSchema = z.object({
  /** GitHub search qualifiers, e.g. "topic:a11y". */
  query: z.string().min(1),
  /** Popularity floor, added unless the query already has a stars: qualifier. */
  min_stars: z.number().int().min(0).default(20),
  /** Repositories per run; each one costs a release lookup. */
  max_results: z.number().int().min(1).max(30).default(15),
})

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
  const config = configSchema.safeParse(source.config)
  if (!config.success) throw new SourceError('Invalid GitHub source configuration')
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
    headers: headers(secrets.GITHUB_TOKEN),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new SourceError(`GitHub: HTTP ${res.status}`)
  const body = searchSchema.safeParse(await res.json())
  if (!body.success) throw new SourceError('GitHub: unexpected response')

  const items = []
  for (const repo of body.data.items) {
    const release = await latestRelease(repo.full_name, secrets.GITHUB_TOKEN)
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
      kind: 'tool' as const,
      change_signature: release?.tag_name ?? null,
    })
  }
  return { items }
}
