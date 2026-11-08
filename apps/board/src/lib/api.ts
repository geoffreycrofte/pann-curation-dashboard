import type {
  BoardItem,
  ItemKind,
  ItemTopicStatus,
  Lang,
  Provider,
  SearchSourceType,
  Source,
  Topic,
  TopicConfig,
  WorkspaceCredential,
  PostDraft,
  Summary,
} from '@pann/shared'
import { supabase } from './supabase'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body.error ?? res.statusText)
  return body as T
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
})

type ItemFields =
  'canonical_url' | 'title' | 'source_lang' | 'kind' | 'origin' | 'published_at' | 'discovered_at'
/** Shape returned by GET /topics/:id/items (item fields nested under `item`). */
type ItemRow = Omit<BoardItem, ItemFields> & { item: Pick<BoardItem, ItemFields> }

/** feed_key: random part of the public feed addresses; null when the feeds are off. */
export type TopicWithConfig = Topic & { config: TopicConfig; feed_key: string | null }

export type AddRssResult =
  | { status: 'created'; source: Source }
  | { status: 'choose'; candidates: { url: string; title: string | null }[] }

export interface AddRssInput {
  url: string
  label?: string
  default_kind: ItemKind | null
  interval_hours: number | null
}

export interface AddItemInput {
  url: string
  title?: string
  kind: ItemKind | null
  status: 'new' | 'validated'
}

export interface AddItemResult {
  item_id: string
  status: ItemTopicStatus
  created: boolean
  canonical_url: string
  title?: string
}

export type SourcePatch = Partial<
  Pick<Source, 'label' | 'active' | 'default_kind' | 'interval_hours' | 'config'>
>

/** Exa search or GitHub repository search (config: see @pann/shared source-config). */
export interface AddSearchSourceInput {
  type: SearchSourceType
  label: string
  config: Record<string, unknown>
  default_kind: ItemKind | null
  interval_hours: number | null
}

export interface NewTopicInput {
  workspace_id: string
  name_fr: string
  name_en: string
  output_langs: Lang[]
  relevance_criteria: string
  monthly_budget_usd: number
}

export type TopicPatch = Partial<Pick<Topic, 'monthly_budget_usd' | 'name_fr' | 'name_en'>>

export interface Me {
  user: { id: string; email?: string }
  workspaces: { role: 'owner' | 'editor'; workspace: { id: string; name: string } }[]
}

export type ItemDetail = Omit<BoardItem, ItemFields> & {
  item: Pick<BoardItem, ItemFields>
  drafted_at: string | null
  summaries: Summary[]
  posts: PostDraft[]
}

export interface QueueItem {
  item_id: string
  status: ItemTopicStatus
  publish_at: string
  item: { title: string; canonical_url: string; source_lang: string | null }
  posts: Pick<
    PostDraft,
    | 'id'
    | 'channel'
    | 'lang'
    | 'status'
    | 'scheduled_at'
    | 'sent_at'
    | 'published_url'
    | 'last_error'
  >[]
}

export interface NewsletterPreview {
  lang: Lang
  period_from: string
  item_count: number
  without_summary: number
  configured: boolean
  subject: string
  html: string
}

export interface NewsletterIssue {
  id: string
  lang: Lang
  status: 'draft' | 'scheduled' | 'sent' | 'failed' | 'skipped'
  subject: string | null
  item_count: number
  period_from: string | null
  period_to: string | null
  sent_at: string | null
  last_error: string | null
  created_at: string
}

export interface NewsletterState {
  auto_send: boolean
  next_at: string | null
  previews: NewsletterPreview[]
  issues: NewsletterIssue[]
}

export interface TopicUsage {
  budget_usd: number
  month_cost_usd: number
  by_operation: { operation: string; cost_usd: number; calls: number }[]
}

export const api = {
  me: () => request<Me>('/me'),
  credentials: (workspaceId: string) =>
    request<WorkspaceCredential[]>(`/workspaces/${workspaceId}/credentials`),
  setCredential: (workspaceId: string, provider: Provider, secret: string, instance?: string) =>
    request<WorkspaceCredential>(
      `/workspaces/${workspaceId}/credentials/${provider}`,
      json('PUT', { secret, instance }),
    ),
  refreshCredential: (workspaceId: string, provider: 'zernio' | 'brevo') =>
    request<void>(`/workspaces/${workspaceId}/credentials/${provider}/refresh`, {
      method: 'POST',
    }),
  deleteCredential: (workspaceId: string, provider: Provider) =>
    request<void>(`/workspaces/${workspaceId}/credentials/${provider}`, { method: 'DELETE' }),

  topics: () => request<Topic[]>('/topics'),
  createTopic: (input: NewTopicInput) => request<Topic>('/topics', json('POST', input)),
  topic: (topicId: string) => request<TopicWithConfig>(`/topics/${topicId}`),
  setFeed: (topicId: string, enabled: boolean, regenerate = false) =>
    request<{ feed_key: string | null }>(
      `/topics/${topicId}/feed`,
      json('POST', { enabled, regenerate }),
    ),
  excludeSite: (topicId: string, domain: string, itemId?: string) =>
    request<{ domain: string; rejected: number }>(
      `/topics/${topicId}/excluded-domains`,
      json('POST', { domain, item_id: itemId }),
    ),
  removeExcludedSite: (topicId: string, domain: string) =>
    request<void>(`/topics/${topicId}/excluded-domains/${encodeURIComponent(domain)}`, {
      method: 'DELETE',
    }),
  updateConfig: (topicId: string, patch: Partial<TopicConfig>) =>
    request<TopicConfig>(`/topics/${topicId}/config`, json('PATCH', patch)),

  items: async (topicId: string, status: ItemTopicStatus): Promise<BoardItem[]> => {
    const rows = await request<ItemRow[]>(`/topics/${topicId}/items?status=${status}`)
    return rows.map(({ item, ...rest }) => ({ ...rest, ...item }))
  },
  /** Items per status; archived is not counted. */
  counts: (topicId: string) =>
    request<Partial<Record<ItemTopicStatus, number>>>(`/topics/${topicId}/counts`),
  addItem: (topicId: string, input: AddItemInput) =>
    request<AddItemResult>(`/topics/${topicId}/items`, json('POST', input)),
  setStatus: (topicId: string, itemId: string, status: ItemTopicStatus) =>
    request(`/topics/${topicId}/items/${itemId}`, json('PATCH', { status })),

  item: (topicId: string, itemId: string) =>
    request<ItemDetail>(`/topics/${topicId}/items/${itemId}`),
  requestDraft: (topicId: string, itemId: string) =>
    request<{ draft_status: string }>(`/topics/${topicId}/items/${itemId}/draft`, {
      method: 'POST',
    }),
  updateSummary: (topicId: string, itemId: string, lang: string, text: string) =>
    request<Summary>(
      `/topics/${topicId}/items/${itemId}/summaries/${lang}`,
      json('PATCH', { text }),
    ),
  updatePost: (topicId: string, postId: string, text: string) =>
    request<PostDraft>(`/topics/${topicId}/posts/${postId}`, json('PATCH', { text })),
  schedule: (topicId: string, itemId: string, when: 'next_slot' | 'now') =>
    request<{ publish_at: string }>(
      `/topics/${topicId}/items/${itemId}/schedule`,
      json('POST', { when }),
    ),
  unschedule: (topicId: string, itemId: string) =>
    request<void>(`/topics/${topicId}/items/${itemId}/schedule`, { method: 'DELETE' }),
  queue: (topicId: string) => request<QueueItem[]>(`/topics/${topicId}/queue`),
  newsletter: (topicId: string) => request<NewsletterState>(`/topics/${topicId}/newsletter`),
  sendNewsletter: (topicId: string, lang?: Lang) =>
    request<void>(`/topics/${topicId}/newsletter/send`, json('POST', { lang })),
  usage: (topicId: string) => request<TopicUsage>(`/topics/${topicId}/usage`),
  updateTopic: (topicId: string, patch: TopicPatch) =>
    request<Topic>(`/topics/${topicId}`, json('PATCH', patch)),

  sources: (topicId: string) => request<Source[]>(`/topics/${topicId}/sources`),
  addRss: (topicId: string, input: AddRssInput) =>
    request<AddRssResult>(`/topics/${topicId}/sources/rss`, json('POST', input)),
  addSearchSource: (topicId: string, input: AddSearchSourceInput) =>
    request<Source>(`/topics/${topicId}/sources`, json('POST', input)),
  updateSource: (topicId: string, sourceId: string, patch: SourcePatch) =>
    request<Source>(`/topics/${topicId}/sources/${sourceId}`, json('PATCH', patch)),
  collectNow: (topicId: string, sourceId: string) =>
    request<Source>(`/topics/${topicId}/sources/${sourceId}/collect`, { method: 'POST' }),
  deleteSource: (topicId: string, sourceId: string) =>
    request<void>(`/topics/${topicId}/sources/${sourceId}`, { method: 'DELETE' }),
}
