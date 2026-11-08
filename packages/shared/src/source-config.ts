import { z } from 'zod'
import type { SourceType } from './domain'

/**
 * Settings of the search sources, validated by the API when a source is created or
 * changed, and by the collector before each run. RSS sources only hold their feed URL.
 */

/** "example.org", without scheme or path; https://… is accepted and reduced to the host. */
export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
  .transform((value) => value.replace(/^www\./, ''))
  .pipe(z.string().regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/, 'Invalid domain'))

const domains = z.array(domainSchema).max(50)

/** Site of a URL as shown and excluded: its host without "www.". Null if not a URL. */
export function siteOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/** True when the URL is on one of the domains or one of their subdomains. */
export function isExcludedUrl(url: string, excluded: readonly string[]): boolean {
  if (!excluded.length) return false
  const host = siteOf(url)
  return !!host && excluded.some((d) => host === d || host.endsWith(`.${d}`))
}

/** https://exa.ai/docs/reference/search (checked 2026-10-01). */
export const exaSourceConfigSchema = z.object({
  query: z.string().trim().min(1).max(1000),
  num_results: z.number().int().min(1).max(25).default(10),
  include_domains: domains.optional(),
  exclude_domains: domains.optional(),
  /** Characters of page text kept for triage. */
  max_characters: z.number().int().min(500).max(20_000).default(6000),
})
export type ExaSourceConfig = z.infer<typeof exaSourceConfigSchema>

export const githubSourceConfigSchema = z.object({
  /** GitHub search qualifiers, e.g. "topic:a11y". */
  query: z.string().trim().min(1).max(256),
  /** Popularity floor, added unless the query already has a stars: qualifier. */
  min_stars: z.number().int().min(0).default(20),
  /** Repositories per run; each one costs a release lookup. */
  max_results: z.number().int().min(1).max(30).default(15),
})
export type GithubSourceConfig = z.infer<typeof githubSourceConfigSchema>

export const SEARCH_SOURCE_TYPES = ['exa', 'github'] as const
export type SearchSourceType = (typeof SEARCH_SOURCE_TYPES)[number]

export const searchSourceConfigSchemas = {
  exa: exaSourceConfigSchema,
  github: githubSourceConfigSchema,
} as const

/**
 * Hacker News, through the Algolia search API (https://hn.algolia.com/api, checked
 * 2026-11-08): stories, comments or both, newest first.
 */
export const hackerNewsSourceConfigSchema = z.object({
  query: z.string().trim().min(1).max(500),
  scope: z.enum(['stories', 'comments', 'all']).default('all'),
  /** Stories below this score are left out (comments have no public score). */
  min_points: z.number().int().min(0).default(0),
  max_results: z.number().int().min(1).max(50).default(20),
})
export type HackerNewsSourceConfig = z.infer<typeof hackerNewsSourceConfigSchema>

/**
 * Bluesky posts, through app.bsky.feed.searchPosts on api.bsky.app, without an
 * account (checked 2026-11-08; public.api.bsky.app refuses searches).
 */
export const blueskySourceConfigSchema = z.object({
  query: z.string().trim().min(1).max(300),
  /** Only posts declared in this language (ISO 639-1), when set. */
  lang: z
    .string()
    .trim()
    .regex(/^[a-z]{2}$/)
    .optional(),
  max_results: z.number().int().min(1).max(50).default(25),
})
export type BlueskySourceConfig = z.infer<typeof blueskySourceConfigSchema>

export const ENGAGEMENT_SOURCE_TYPES = ['hackernews', 'bluesky'] as const
export type EngagementSourceType = (typeof ENGAGEMENT_SOURCE_TYPES)[number]

export const engagementSourceConfigSchemas = {
  hackernews: hackerNewsSourceConfigSchema,
  bluesky: blueskySourceConfigSchema,
} as const

/** Tool a source feeds, from its type: conversations go to engagement. */
export function moduleOfSourceType(type: SourceType): 'curation' | 'engagement' {
  return (ENGAGEMENT_SOURCE_TYPES as readonly string[]).includes(type) ? 'engagement' : 'curation'
}

/** URL-safe identifier from a name: "Accessibilité numérique" → "accessibilite-numerique". */
export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'topic'
  )
}
