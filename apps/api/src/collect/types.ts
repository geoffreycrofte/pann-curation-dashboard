import {
  errorCode,
  type ErrorCode,
  type ItemKind,
  type Provider,
  type ConversationMeta,
  type SourceType,
  type TopicConfig,
} from '@pann/shared'

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
  /** Conversations (engagement): platform, author, thread, points. */
  meta?: ConversationMeta
}

export interface UsageEntry {
  provider: string
  model?: string
  operation: string
  units: Record<string, number | string>
  cost_usd: number
}

export interface AdapterResult {
  items: CollectedItem[]
  usage?: UsageEntry[]
}

/** Keys of the source's workspace, set from the board (Connections page). */
export type CollectSecrets = Partial<Record<Provider, string>>

export interface AdapterContext {
  /** Entries published before this date are ignored. */
  since: Date
  secrets: CollectSecrets
}

export interface CollectSource {
  id: string
  topic_id: string
  workspace_id: string
  /** Tool the source feeds: its items are linked to the topic for that tool. */
  module: 'curation' | 'engagement'
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

/** Raised for problems shown as the source's last error. `message` is an error code (@pann/shared). */
export class SourceError extends Error {
  constructor(code: ErrorCode, detail?: string | number) {
    super(errorCode(code, detail))
  }
}
