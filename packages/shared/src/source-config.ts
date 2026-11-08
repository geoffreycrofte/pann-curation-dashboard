import { z } from 'zod'

/**
 * Settings of the search sources, validated by the API when a source is created or
 * changed, and by the collector before each run. RSS sources only hold their feed URL.
 */

/** "example.org", without scheme or path; https://… is accepted and reduced to the host. */
const domain = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
  .pipe(z.string().regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/, 'Invalid domain'))

const domains = z.array(domain).max(50)

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
