import type {
  BoardItem,
  DraftChannel,
  ItemKind,
  ItemTopicStatus,
  Lang,
  CredentialStatus,
  PlatformProvider,
  Provider,
  SearchSourceType,
  EngagementSourceType,
  Conversation,
  TopicModule,
  Source,
  Topic,
  TopicConfig,
  TopicKind,
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

/** Fields of the shared item; the others (kind included) belong to the item in the topic. */
type ItemFields =
  'canonical_url' | 'title' | 'source_lang' | 'origin' | 'published_at' | 'discovered_at'
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
  type: SearchSourceType | EngagementSourceType
  label: string
  config: Record<string, unknown>
  default_kind: ItemKind | null
  interval_hours: number | null
}

/** A new topic as reviewed at the end of the onboarding. */
export interface NewTopicInput {
  workspace_id: string
  name_fr: string
  /** The other name defaults to the first one. */
  name_en?: string
  monthly_budget_usd: number
  /** First settings: any part of a topic config. */
  config: Record<string, unknown>
  /** What Pann does not do yet: another network, a coming tool. */
  requests: { kind: 'network' | 'feature'; subject: string }[]
}

export interface OnboardingMessage {
  role: 'user' | 'assistant'
  text: string
  quick_replies?: string[]
}

/** Settings proposed by the onboarding assistant; null while unknown. */
export interface OnboardingProposal {
  name_en: string | null
  description: string | null
  audience: string | null
  messages: string | null
  claims_to_avoid: string | null
  output_langs: string[] | null
  relevance_criteria: string | null
  engagement_criteria: string | null
  style_rules: string | null
  post_rules: string | null
  posts_per_day: number | null
  slots: string[] | null
}

export interface OnboardingSession {
  id: string
  workspace_id: string
  messages: OnboardingMessage[]
  proposal: Partial<OnboardingProposal>
  status: 'pending' | 'idle' | 'done' | 'failed'
  /** Error code (errors.*). */
  error: string | null
  updated_at: string
}

export interface OnboardingContext {
  name: string
  url?: string
  tools: ('curation' | 'engagement' | 'compose')[]
  channels: string[]
  listen: string[]
  newsletter?: boolean
  ui_lang: 'fr' | 'en'
  /** Adjusting an existing topic: its current settings, as text. */
  current?: Record<string, string>
}

/** Création: a source of a composition (a given link, or a search result to choose). */
export interface ComposeSource {
  url: string
  title: string
  excerpt?: string
  text?: string
  selected: boolean
}

export type ComposeModeName = 'notes' | 'links' | 'search'
export type JobStatus = 'idle' | 'pending' | 'failed'

export interface CompositionSummary {
  id: string
  subject: string
  mode: ComposeModeName
  status: 'draft' | 'scheduled' | 'published'
  publish_at: string | null
  draft_status: JobStatus
  created_at: string
  updated_at: string
}

export interface CompositionMedia {
  id: string
  composition_id: string
  storage_path: string
  mime: string
  bytes: number
  width: number
  height: number
  position: number
  alt: Record<string, string>
  /** Languages whose text the AI proposed and the person has not edited yet. */
  alt_proposed: string[]
  alt_status: JobStatus
  alt_error: string | null
  /** Signed address to show it, valid for an hour. */
  preview_url: string | null
}

export interface Composition extends CompositionSummary {
  topic_id: string
  notes: string
  link: string
  sources: ComposeSource[]
  channels: DraftChannel[]
  draft_error: string | null
  research_status: JobStatus
  research_error: string | null
  media: CompositionMedia[]
  posts: PostDraft[]
}

export type CompositionPatch = Partial<
  Pick<Composition, 'subject' | 'mode' | 'notes' | 'link' | 'sources' | 'channels'>
>

export interface RewriteInput {
  text: string
  preset: 'shorter' | 'longer' | 'formal' | 'casual' | 'custom'
  instruction?: string
  target: { kind: 'summary'; lang: Lang } | { kind: 'post'; lang: Lang; channel: DraftChannel }
}

export type TopicPatch = Partial<Pick<Topic, 'monthly_budget_usd' | 'name_fr' | 'name_en'>>

export interface Me {
  user: { id: string; email?: string }
  workspaces: { role: 'owner' | 'editor'; workspace: { id: string; name: string } }[]
  /** Platform admin: sees the admin space (Pann's keys and cost centre). */
  is_platform_admin: boolean
}

export interface PlatformKey {
  provider: PlatformProvider
  hint: string
  status: CredentialStatus
  status_detail: string | null
  checked_at: string | null
  updated_at: string
}

export interface PlatformSettings {
  onboarding_credit_usd: number
  monthly_cap_usd: number
  /** Sender of the service emails, on a domain verified in Resend. */
  email_from: string
  updated_at: string
}

export type AccessRequestStatus = 'new' | 'accepted' | 'declined'

export type FeatureRequestStatus = 'new' | 'planned' | 'answered' | 'declined'

/** Asked from the product: a network Pann does not publish to, a coming tool. */
export interface FeatureRequest {
  id: string
  kind: 'network' | 'feature'
  subject: string
  status: FeatureRequestStatus
  created_at: string
  workspace: { name: string } | null
}

export interface AccessRequest {
  id: string
  name: string
  email: string
  motivation: string
  lang: 'fr' | 'en'
  status: AccessRequestStatus
  notified_at: string | null
  notify_error: string | null
  handled_at: string | null
  created_at: string
}

export interface PlatformUsageRow {
  workspace_id: string
  workspace_name: string
  provider: string
  operation: string
  calls: number
  cost_usd: number
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
  /** Without sign-in: a person without an account asks for one. */
  requestAccess: (input: {
    name: string
    email: string
    motivation: string
    lang: 'fr' | 'en'
    website: string
  }) => request<{ ok: true }>('/access-requests', json('POST', input)),
  adminAccessRequests: () => request<AccessRequest[]>('/admin/access-requests'),
  adminFeatureRequests: () => request<FeatureRequest[]>('/admin/feature-requests'),
  setFeatureRequestStatus: (id: string, status: FeatureRequestStatus) =>
    request<{ id: string; status: FeatureRequestStatus }>(
      `/admin/feature-requests/${id}`,
      json('PATCH', { status }),
    ),
  handleAccessRequest: (id: string, status: AccessRequestStatus) =>
    request<AccessRequest>(`/admin/access-requests/${id}`, json('PATCH', { status })),
  adminKeys: () => request<PlatformKey[]>('/admin/credentials'),
  setAdminKey: (provider: PlatformProvider, secret: string) =>
    request<PlatformKey>(`/admin/credentials/${provider}`, json('PUT', { secret })),
  deleteAdminKey: (provider: PlatformProvider) =>
    request<void>(`/admin/credentials/${provider}`, { method: 'DELETE' }),
  adminSettings: () => request<PlatformSettings>('/admin/settings'),
  updateAdminSettings: (patch: Partial<Omit<PlatformSettings, 'updated_at'>>) =>
    request<PlatformSettings>('/admin/settings', json('PATCH', patch)),
  /** month: YYYY-MM (UTC). */
  adminUsage: (month: string) => request<PlatformUsageRow[]>(`/admin/usage?month=${month}`),
  renameWorkspace: (workspaceId: string, name: string) =>
    request<{ id: string; name: string }>(`/workspaces/${workspaceId}`, json('PATCH', { name })),
  /** Queues the deletion of the account; the email typed by the person confirms it. */
  deleteAccount: (confirmEmail: string) =>
    request<void>('/account', json('DELETE', { confirm_email: confirmEmail })),
  credentials: (workspaceId: string) =>
    request<WorkspaceCredential[]>(`/workspaces/${workspaceId}/credentials`),
  /** `instance`: Mastodon only; `handle`: Bluesky only. */
  setCredential: (
    workspaceId: string,
    provider: Provider,
    secret: string,
    extra: { instance?: string; handle?: string } = {},
  ) =>
    request<WorkspaceCredential>(
      `/workspaces/${workspaceId}/credentials/${provider}`,
      json('PUT', { secret, ...extra }),
    ),
  refreshCredential: (workspaceId: string, provider: 'zernio' | 'brevo' | 'sendfox') =>
    request<void>(`/workspaces/${workspaceId}/credentials/${provider}/refresh`, {
      method: 'POST',
    }),
  /** `account`: which one, for the networks with several accounts (Bluesky, Mastodon, Discord). */
  deleteCredential: (workspaceId: string, provider: Provider, account = '') =>
    request<void>(
      `/workspaces/${workspaceId}/credentials/${provider}${account ? `?${new URLSearchParams({ account })}` : ''}`,
      { method: 'DELETE' },
    ),

  topics: () => request<Topic[]>('/topics'),
  createTopic: (input: NewTopicInput) => request<Topic>('/topics', json('POST', input)),
  analyzeVoice: (topicId: string, samples: string, uiLang: 'fr' | 'en') =>
    request<{ id: string; status: string }>(
      `/topics/${topicId}/voice-analyses`,
      json('POST', { samples, ui_lang: uiLang }),
    ),
  voiceAnalysis: (topicId: string, id: string) =>
    request<{
      id: string
      status: 'pending' | 'done' | 'failed'
      result: { style_rules: string; post_rules: string } | null
      error: string | null
    }>(`/topics/${topicId}/voice-analyses/${id}`),
  compositions: (topicId: string) =>
    request<CompositionSummary[]>(`/topics/${topicId}/compositions`),
  createComposition: (topicId: string, input: { subject?: string; mode?: ComposeModeName } = {}) =>
    request<Composition>(`/topics/${topicId}/compositions`, json('POST', input)),
  composition: (topicId: string, id: string) =>
    request<Composition>(`/topics/${topicId}/compositions/${id}`),
  updateComposition: (topicId: string, id: string, patch: CompositionPatch) =>
    request<Composition>(`/topics/${topicId}/compositions/${id}`, json('PATCH', patch)),
  deleteComposition: (topicId: string, id: string) =>
    request<void>(`/topics/${topicId}/compositions/${id}`, { method: 'DELETE' }),
  researchComposition: (topicId: string, id: string) =>
    request<{ queued: boolean }>(`/topics/${topicId}/compositions/${id}/research`, {
      method: 'POST',
    }),
  draftComposition: (topicId: string, id: string) =>
    request<{ queued: boolean }>(`/topics/${topicId}/compositions/${id}/draft`, {
      method: 'POST',
    }),
  addCompositionMedia: (
    topicId: string,
    id: string,
    media: { storage_path: string; mime: string; bytes: number; width: number; height: number },
  ) =>
    request<CompositionMedia>(`/topics/${topicId}/compositions/${id}/media`, json('POST', media)),
  updateCompositionMedia: (
    topicId: string,
    id: string,
    mediaId: string,
    patch: Partial<Pick<CompositionMedia, 'alt' | 'alt_proposed' | 'position'>>,
  ) =>
    request<CompositionMedia>(
      `/topics/${topicId}/compositions/${id}/media/${mediaId}`,
      json('PATCH', patch),
    ),
  describeCompositionMedia: (topicId: string, id: string, mediaId: string) =>
    request<{ queued: boolean }>(
      `/topics/${topicId}/compositions/${id}/media/${mediaId}/describe`,
      { method: 'POST' },
    ),
  deleteCompositionMedia: (topicId: string, id: string, mediaId: string) =>
    request<void>(`/topics/${topicId}/compositions/${id}/media/${mediaId}`, {
      method: 'DELETE',
    }),
  scheduleComposition: (topicId: string, id: string, when: 'next_slot' | 'now') =>
    request<{ publish_at: string }>(
      `/topics/${topicId}/compositions/${id}/schedule`,
      json('POST', { when }),
    ),
  unscheduleComposition: (topicId: string, id: string) =>
    request<void>(`/topics/${topicId}/compositions/${id}/schedule`, { method: 'DELETE' }),
  /** Uploads an image of a composition to the storage (RLS: members of the topic). */
  uploadCompositionImage: async (path: string, blob: Blob, contentType: string) => {
    const { error } = await supabase.storage
      .from('composition-media')
      .upload(path, blob, { contentType, upsert: false })
    if (error) throw new ApiError(400, error.message)
  },
  onboardingAvailable: (workspaceId: string) =>
    request<{ available: boolean }>(
      `/onboarding/available?workspace_id=${encodeURIComponent(workspaceId)}`,
    ),
  startOnboarding: (workspaceId: string, context: OnboardingContext) =>
    request<OnboardingSession>(
      '/onboarding/sessions',
      json('POST', { workspace_id: workspaceId, context }),
    ),
  onboardingSession: (sessionId: string) =>
    request<OnboardingSession>(`/onboarding/sessions/${sessionId}`),
  answerOnboarding: (sessionId: string, text: string) =>
    request<OnboardingSession>(
      `/onboarding/sessions/${sessionId}/messages`,
      json('POST', { text }),
    ),
  retryOnboarding: (sessionId: string) =>
    request<OnboardingSession>(`/onboarding/sessions/${sessionId}/retry`, { method: 'POST' }),
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
  /** New list of kinds; removed kinds are replaced on items and sources (null: no kind). */
  setKinds: (topicId: string, kinds: TopicKind[], replacements: Record<string, string | null>) =>
    request<TopicConfig>(`/topics/${topicId}/kinds`, json('PUT', { kinds, replacements })),
  updateConfig: (topicId: string, patch: Partial<TopicConfig>) =>
    request<TopicConfig>(`/topics/${topicId}/config`, json('PATCH', patch)),

  items: async (topicId: string, status: ItemTopicStatus): Promise<BoardItem[]> => {
    const rows = await request<ItemRow[]>(`/topics/${topicId}/items?status=${status}`)
    return rows.map(({ item, ...rest }) => ({ ...rest, ...item }))
  },
  /** Items per status; archived is not counted. */
  counts: (topicId: string, module: TopicModule = 'curation') =>
    request<Partial<Record<ItemTopicStatus | 'scheduled', number>>>(
      `/topics/${topicId}/counts?module=${module}`,
    ),
  /** Conversations of the engagement tool with this status. */
  conversations: (topicId: string, status: ItemTopicStatus) =>
    request<Conversation[]>(`/topics/${topicId}/conversations?status=${status}`),
  addItem: (topicId: string, input: AddItemInput) =>
    request<AddItemResult>(`/topics/${topicId}/items`, json('POST', input)),
  setItemKind: (topicId: string, itemId: string, kind: string | null) =>
    request(`/topics/${topicId}/items/${itemId}`, json('PATCH', { kind })),
  setStatus: (topicId: string, itemId: string, status: ItemTopicStatus) =>
    request(`/topics/${topicId}/items/${itemId}`, json('PATCH', { status })),

  item: (topicId: string, itemId: string) =>
    request<ItemDetail>(`/topics/${topicId}/items/${itemId}`),
  requestDraft: (topicId: string, itemId: string) =>
    request<{ draft_status: string }>(`/topics/${topicId}/items/${itemId}/draft`, {
      method: 'POST',
    }),
  /** Drafts only the posts the item lacks (networks added to the topic since). */
  requestMissingPosts: (topicId: string, itemId: string) =>
    request<{ draft_status: string }>(`/topics/${topicId}/items/${itemId}/draft-missing`, {
      method: 'POST',
    }),
  /** Pasted source text replaces the unreadable page content, then drafting runs again. */
  submitSourceText: (topicId: string, itemId: string, text: string) =>
    request<{ draft_status: string }>(
      `/topics/${topicId}/items/${itemId}/source-text`,
      json('POST', { text }),
    ),
  updateSummary: (topicId: string, itemId: string, lang: string, text: string) =>
    request<Summary>(
      `/topics/${topicId}/items/${itemId}/summaries/${lang}`,
      json('PATCH', { text }),
    ),
  /** AI rewrite: recorded, then run by a job; `rewriteResult` is polled until done. */
  rewrite: (topicId: string, itemId: string, input: RewriteInput) =>
    request<{ id: string }>(`/topics/${topicId}/items/${itemId}/rewrites`, json('POST', input)),
  rewriteResult: (topicId: string, rewriteId: string) =>
    request<{
      id: string
      status: 'pending' | 'done' | 'failed'
      result: string | null
      error: string | null
    }>(`/topics/${topicId}/rewrites/${rewriteId}`),
  updatePost: (topicId: string, postId: string, text: string) =>
    request<PostDraft>(`/topics/${topicId}/posts/${postId}`, json('PATCH', { text })),
  /** LinkedIn first comment: null = default of the topic, '' = none. */
  updateFirstComment: (topicId: string, postId: string, firstComment: string | null) =>
    request<PostDraft>(
      `/topics/${topicId}/posts/${postId}/first-comment`,
      json('PATCH', { first_comment: firstComment }),
    ),
  schedule: (topicId: string, itemId: string, when: 'next_slot' | 'now') =>
    request<{ publish_at: string }>(
      `/topics/${topicId}/items/${itemId}/schedule`,
      json('POST', { when }),
    ),
  unschedule: (topicId: string, itemId: string) =>
    request<void>(`/topics/${topicId}/items/${itemId}/schedule`, { method: 'DELETE' }),
  /** From 14 days ago by default; `range` (ISO instants) narrows it to a period. */
  queue: (topicId: string, range?: { from: string; to: string }) =>
    request<QueueItem[]>(
      `/topics/${topicId}/queue${range ? `?${new URLSearchParams(range)}` : ''}`,
    ),
  newsletter: (topicId: string) => request<NewsletterState>(`/topics/${topicId}/newsletter`),
  sendNewsletter: (topicId: string, lang?: Lang) =>
    request<void>(`/topics/${topicId}/newsletter/send`, json('POST', { lang })),
  usage: (topicId: string) => request<TopicUsage>(`/topics/${topicId}/usage`),
  updateTopic: (topicId: string, patch: TopicPatch) =>
    request<Topic>(`/topics/${topicId}`, json('PATCH', patch)),

  sources: (topicId: string, module: TopicModule) =>
    request<Source[]>(`/topics/${topicId}/sources?module=${module}`),
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
