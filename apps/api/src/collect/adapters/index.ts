import type { SourceType } from '@pann/shared'
import type { Adapter } from '../types'
import { blueskyAdapter } from './bluesky'
import { exaAdapter } from './exa'
import { githubAdapter } from './github'
import { hackerNewsAdapter } from './hackernews'
import { rssAdapter } from './rss'

export const adapters: Record<SourceType, Adapter> = {
  rss: rssAdapter,
  exa: exaAdapter,
  github: githubAdapter,
  hackernews: hackerNewsAdapter,
  bluesky: blueskyAdapter,
}
