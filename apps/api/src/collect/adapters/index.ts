import type { SourceType } from '@pann/shared'
import type { Adapter } from '../types'
import { exaAdapter } from './exa'
import { githubAdapter } from './github'
import { rssAdapter } from './rss'

export const adapters: Record<SourceType, Adapter> = {
  rss: rssAdapter,
  exa: exaAdapter,
  github: githubAdapter,
}
