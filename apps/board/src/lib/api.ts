import type { BoardItem, ItemTopicStatus, Topic } from '@pann/shared'
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
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body.error ?? res.statusText)
  return body as T
}

/** Shape returned by GET /topics/:id/items (item fields nested under `item`). */
type ItemRow = Omit<
  BoardItem,
  'canonical_url' | 'title' | 'source_lang' | 'kind' | 'published_at' | 'discovered_at'
> & {
  item: Pick<
    BoardItem,
    'canonical_url' | 'title' | 'source_lang' | 'kind' | 'published_at' | 'discovered_at'
  >
}

export const api = {
  topics: () => request<Topic[]>('/topics'),
  items: async (topicId: string, status: ItemTopicStatus): Promise<BoardItem[]> => {
    const rows = await request<ItemRow[]>(`/topics/${topicId}/items?status=${status}`)
    return rows.map(({ item, ...rest }) => ({ ...rest, ...item }))
  },
  setStatus: (topicId: string, itemId: string, status: ItemTopicStatus) =>
    request(`/topics/${topicId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
}
