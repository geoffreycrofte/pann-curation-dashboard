import type { BoardItem, ItemKind, ItemTopicStatus, Source, Topic, TopicConfig } from '@pann/shared'
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

export const api = {
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

  sources: (topicId: string) => request<Source[]>(`/topics/${topicId}/sources`),
  addRss: (topicId: string, input: AddRssInput) =>
    request<AddRssResult>(`/topics/${topicId}/sources/rss`, json('POST', input)),
  updateSource: (topicId: string, sourceId: string, patch: SourcePatch) =>
    request<Source>(`/topics/${topicId}/sources/${sourceId}`, json('PATCH', patch)),
  deleteSource: (topicId: string, sourceId: string) =>
    request<void>(`/topics/${topicId}/sources/${sourceId}`, { method: 'DELETE' }),
}
