import type {
  BoardItem,
  ItemKind,
  ItemTopicStatus,
  Provider,
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

export type TopicWithConfig = Topic & { config: TopicConfig }

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
  Pick<Source, 'label' | 'active' | 'default_kind' | 'interval_hours'>
>

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

export interface TopicUsage {
  budget_usd: number
  month_cost_usd: number
  by_operation: { operation: string; cost_usd: number; calls: number }[]
}

export const api = {
  me: () => request<Me>('/me'),
  credentials: (workspaceId: string) =>
    request<WorkspaceCredential[]>(`/workspaces/${workspaceId}/credentials`),
  setCredential: (workspaceId: string, provider: Provider, secret: string) =>
    request<WorkspaceCredential>(
      `/workspaces/${workspaceId}/credentials/${provider}`,
      json('PUT', { secret }),
    ),
  deleteCredential: (workspaceId: string, provider: Provider) =>
    request<void>(`/workspaces/${workspaceId}/credentials/${provider}`, { method: 'DELETE' }),

  topics: () => request<Topic[]>('/topics'),
  topic: (topicId: string) => request<TopicWithConfig>(`/topics/${topicId}`),
  updateConfig: (topicId: string, patch: Partial<TopicConfig>) =>
    request<TopicConfig>(`/topics/${topicId}/config`, json('PATCH', patch)),

  items: async (topicId: string, status: ItemTopicStatus): Promise<BoardItem[]> => {
    const rows = await request<ItemRow[]>(`/topics/${topicId}/items?status=${status}`)
    return rows.map(({ item, ...rest }) => ({ ...rest, ...item }))
  },
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
  usage: (topicId: string) => request<TopicUsage>(`/topics/${topicId}/usage`),
  updateTopic: (topicId: string, patch: { monthly_budget_usd: number }) =>
    request<Topic>(`/topics/${topicId}`, json('PATCH', patch)),

  sources: (topicId: string) => request<Source[]>(`/topics/${topicId}/sources`),
  addRss: (topicId: string, input: AddRssInput) =>
    request<AddRssResult>(`/topics/${topicId}/sources/rss`, json('POST', input)),
  updateSource: (topicId: string, sourceId: string, patch: SourcePatch) =>
    request<Source>(`/topics/${topicId}/sources/${sourceId}`, json('PATCH', patch)),
  collectNow: (topicId: string, sourceId: string) =>
    request<Source>(`/topics/${topicId}/sources/${sourceId}/collect`, { method: 'POST' }),
  deleteSource: (topicId: string, sourceId: string) =>
    request<void>(`/topics/${topicId}/sources/${sourceId}`, { method: 'DELETE' }),
}
