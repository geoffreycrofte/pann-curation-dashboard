import type { ItemKind, SourceType, TopicConfig } from '@pann/shared'

/** An entry as returned by an adapter, before URL normalisation. */
export interface CollectedItem {
  url: string
  title: string
  content?: string | null
  published_at?: string | null
  source_lang?: string | null
  kind?: ItemKind | null
  /** Tools: release tag, used to re-propose a published tool when it changes. */
  change_signature?: string | null
}

export interface UsageEntry {
  provider: string
  model?: string
  operation: string
  units: Record<string, number>
  cost_usd: number
}

export interface AdapterResult {
  items: CollectedItem[]
  usage?: UsageEntry[]
}

export interface CollectSecrets {
  EXA_API_KEY?: string
  GITHUB_TOKEN?: string
}

export interface AdapterContext {
  /** Entries published before this date are ignored. */
  since: Date
  secrets: CollectSecrets
}

export interface CollectSource {
  id: string
  topic_id: string
  workspace_id: string
  type: SourceType
  label: string
  config: Record<string, unknown>
  active: boolean
  default_kind: ItemKind | null
  interval_hours: number | null
  last_run_at: string | null
  run_requested_at: string | null
  topic_config: TopicConfig
}

export type Adapter = (source: CollectSource, ctx: AdapterContext) => Promise<AdapterResult>

/** Raised for problems worth showing as the source's last error. */
export class SourceError extends Error {}
