import type { SearchSourceType } from '@pann/shared'

/** Form state of a search source: plain strings and numbers, one domain per line. */
export interface SearchDraft {
  query: string
  num_results: number
  include_domains: string
  exclude_domains: string
  min_stars: number
  max_results: number
}

export function emptyDraft(): SearchDraft {
  return {
    query: '',
    num_results: 10,
    include_domains: '',
    exclude_domains: '',
    min_stars: 20,
    max_results: 15,
  }
}

function lines(value: unknown): string {
  return Array.isArray(value) ? value.join('\n') : ''
}

function list(value: string): string[] | undefined {
  const items = value
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean)
  return items.length ? items : undefined
}

export function toDraft(config: Record<string, unknown>): SearchDraft {
  const draft = emptyDraft()
  return {
    query: typeof config.query === 'string' ? config.query : '',
    num_results: typeof config.num_results === 'number' ? config.num_results : draft.num_results,
    include_domains: lines(config.include_domains),
    exclude_domains: lines(config.exclude_domains),
    min_stars: typeof config.min_stars === 'number' ? config.min_stars : draft.min_stars,
    max_results: typeof config.max_results === 'number' ? config.max_results : draft.max_results,
  }
}

/**
 * Config sent to the API (validated there). Keys the form does not show, such as
 * max_characters for Exa, are kept from `previous`.
 */
export function toConfig(
  type: SearchSourceType,
  draft: SearchDraft,
  previous: Record<string, unknown> = {},
): Record<string, unknown> {
  if (type === 'exa') {
    const { include_domains: _i, exclude_domains: _e, ...kept } = previous
    return {
      ...kept,
      query: draft.query,
      num_results: draft.num_results,
      include_domains: list(draft.include_domains),
      exclude_domains: list(draft.exclude_domains),
    }
  }
  return {
    ...previous,
    query: draft.query,
    min_stars: draft.min_stars,
    max_results: draft.max_results,
  }
}
