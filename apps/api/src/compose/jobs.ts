import {
  claudeCostUsd,
  channelLangs,
  draftChannels,
  errorCode,
  DRAFT_CHANNELS,
  type ComposeMode,
  type DraftChannel,
  type Lang,
  type TopicConfig,
} from '@glimr/shared'
import type { UsageEntry } from '../collect/types'
import { longestSignature } from '../draft/draft'
import type { TokenUsage } from '../draft/model'
import type { ComposeModel, StructuredResult } from './model'
import {
  ALT_PROMPT_VERSION,
  altOutputSchema,
  altSystemPrompt,
  COMPOSE_PROMPT_VERSION,
  composeOutputSchema,
  composeSystemPrompt,
  composeUserMessage,
  MAX_SOURCES,
  type ComposeOutput,
} from './prompt'

export interface ComposeSource {
  url: string
  title: string
  /** First lines, shown to choose among search results. */
  excerpt?: string
  /** Full text, read once (search results come with it, links are fetched). */
  text?: string
  selected: boolean
}

export interface CompositionRow {
  id: string
  topic_id: string
  workspace_id: string
  subject: string
  mode: ComposeMode
  notes: string
  link: string
  sources: ComposeSource[]
  channels: string[]
  draft_status: string
  research_status: string
  topic: { name_en: string; config: TopicConfig; monthly_budget_usd: number }
}

export interface MediaRow {
  id: string
  composition_id: string
  storage_path: string
  mime: string
  alt: Record<string, string>
  alt_proposed: string[]
  alt_status: string
}

export interface SearchResult {
  url: string
  title: string
  text: string
}

export type SearchOutcome =
  { ok: true; results: SearchResult[]; cost_usd: number } | { ok: false; error: string }

/** What the jobs read and write; the Supabase version is in store.ts. */
export interface ComposeStore {
  composition(id: string): Promise<CompositionRow | null>
  updateComposition(id: string, fields: Record<string, unknown>): Promise<void>
  media(id: string): Promise<MediaRow | null>
  updateMedia(id: string, fields: Record<string, unknown>): Promise<void>
  /** Bytes of a stored image, to send to the model. */
  mediaBytes(path: string): Promise<Uint8Array>
  /** Replaces the text of the posts still in draft (or failed); creates the missing ones. */
  saveDrafts(
    composition: CompositionRow,
    posts: { channel: DraftChannel; lang: Lang; body: string }[],
  ): Promise<void>
  monthCostUsd(topicId: string): Promise<number>
  key(workspaceId: string, provider: 'anthropic' | 'exa'): Promise<string | undefined>
  /** Why there is no key (quota used up on plans where Glimr provides the AI). */
  missingKeyError?(workspaceId: string, provider: string): Promise<string>
  logUsage(composition: CompositionRow, entry: UsageEntry): Promise<void>
}

export interface ComposeDeps {
  store: ComposeStore
  model: ComposeModel
  /** Text of a web page (links mode). */
  fetchSource(url: string): Promise<string>
  search(apiKey: string, query: string, excludeDomains: string[]): Promise<SearchOutcome>
}

const usageEntry = (
  operation: string,
  promptVersion: string,
  result: StructuredResult<unknown>,
  requested: string,
): UsageEntry | null => {
  if (!result.usage) return null
  const model = result.model ?? requested
  const usage: TokenUsage = result.usage
  return {
    provider: 'anthropic',
    model,
    operation,
    units: { ...usage, prompt_version: promptVersion },
    cost_usd: claudeCostUsd(model, usage),
  }
}

/** Networks to write for: the chosen ones the topic publishes to, or all of them. */
export function compositionChannels(
  config: TopicConfig,
  chosen: readonly string[],
): DraftChannel[] {
  const available = draftChannels(config)
  const picked = DRAFT_CHANNELS.filter((c) => chosen.includes(c) && available.includes(c))
  return picked.length ? picked : available
}

// ---------------------------------------------------------------------------
// Search (mode "search"): results the person chooses from
// ---------------------------------------------------------------------------

export async function runComposeResearch(deps: ComposeDeps, compositionId: string) {
  const { store } = deps
  const composition = await store.composition(compositionId)
  if (!composition || composition.research_status !== 'pending') return 'skipped'
  const fail = async (error: string) => {
    await store.updateComposition(compositionId, {
      research_status: 'failed',
      research_error: error,
    })
    return error
  }
  const { config, monthly_budget_usd } = composition.topic
  if ((await store.monthCostUsd(composition.topic_id)) >= monthly_budget_usd)
    return fail('budget_exceeded')
  const key = await store.key(composition.workspace_id, 'exa')
  if (!key)
    return fail(
      (await store.missingKeyError?.(composition.workspace_id, 'exa')) ??
        errorCode('missing_credential', 'exa'),
    )
  const query = composition.subject.trim() || composition.notes.trim().slice(0, 300)
  if (!query) return fail('insufficient_content')

  const outcome = await deps.search(key, query, config.collection.excluded_domains)
  if (!outcome.ok) return fail(outcome.error)
  await store.logUsage(composition, {
    provider: 'exa',
    operation: 'compose_search',
    units: { searches: 1, results: outcome.results.length },
    cost_usd: outcome.cost_usd,
  })
  // The sources already chosen stay; the new results replace the others.
  const kept = composition.sources.filter((s) => s.selected)
  const known = new Set(kept.map((s) => s.url))
  const found: ComposeSource[] = outcome.results
    .filter((r) => !known.has(r.url))
    .map((r) => ({
      url: r.url,
      title: r.title,
      excerpt: r.text.slice(0, 300).trim(),
      text: r.text,
      selected: false,
    }))
  await store.updateComposition(compositionId, {
    sources: [...kept, ...found],
    research_status: 'idle',
    research_error: null,
  })
  return 'done'
}

// ---------------------------------------------------------------------------
// Drafting: one post per network and language, from the material of the mode
// ---------------------------------------------------------------------------

export async function runComposeDraft(deps: ComposeDeps, compositionId: string) {
  const { store } = deps
  const composition = await store.composition(compositionId)
  if (!composition || composition.draft_status !== 'pending') return 'skipped'
  const fail = async (error: string) => {
    await store.updateComposition(compositionId, { draft_status: 'failed', draft_error: error })
    return error
  }
  const { config, monthly_budget_usd } = composition.topic
  if ((await store.monthCostUsd(composition.topic_id)) >= monthly_budget_usd)
    return fail('budget_exceeded')
  const apiKey = await store.key(composition.workspace_id, 'anthropic')
  if (!apiKey)
    return fail(
      (await store.missingKeyError?.(composition.workspace_id, 'anthropic')) ??
        errorCode('missing_credential', 'anthropic'),
    )

  // Material: notes always; with links or search, the chosen sources (read once).
  let sources = composition.sources
  const chosen =
    composition.mode === 'notes' ? [] : sources.filter((s) => s.selected).slice(0, MAX_SOURCES)
  const read: { url: string; title: string; text: string }[] = []
  for (const source of chosen) {
    let text = source.text ?? ''
    if (!text) {
      text = await deps.fetchSource(source.url).catch(() => '')
      if (text) sources = sources.map((s) => (s.url === source.url ? { ...s, text } : s))
    }
    read.push({ url: source.url, title: source.title, text })
  }
  if (sources !== composition.sources) await store.updateComposition(compositionId, { sources })
  const hasMaterial = composition.notes.trim() || read.some((s) => s.text.trim())
  if (!hasMaterial) return fail('insufficient_content')

  // Each network in the languages its accounts publish in: no tokens for the others.
  const targets = compositionChannels(config, composition.channels)
    .map((channel) => ({ channel, langs: channelLangs(config, channel) }))
    .filter((target) => target.langs.length > 0)
  const channels = targets.map((target) => target.channel)
  const model = config.ai.draft_model
  const result = await deps.model<ComposeOutput>({
    apiKey,
    model,
    effort: config.ai.draft_effort,
    system: composeSystemPrompt(composition.topic, composition.mode),
    content: composeUserMessage(
      {
        subject: composition.subject,
        notes: composition.notes,
        link: composition.link,
        sources: read,
      },
      channels,
      { linkedin: longestSignature(config) },
    ),
    schema: composeOutputSchema(targets),
  })
  const usage = usageEntry('compose', COMPOSE_PROMPT_VERSION, result, model)
  if (usage) await store.logUsage(composition, usage)
  if (!result.ok) return fail(result.error)
  if (result.output.insufficient_material) return fail('insufficient_content')

  const posts = targets.flatMap(({ channel, langs }) =>
    langs.flatMap((lang) => {
      const body = result.output.posts[channel]?.[lang]?.trim()
      return body ? [{ channel, lang, body }] : []
    }),
  )
  await store.saveDrafts(composition, posts)
  await store.updateComposition(compositionId, { draft_status: 'idle', draft_error: null })
  return 'done'
}

// ---------------------------------------------------------------------------
// Text alternatives: proposed by the model, in every language still empty
// ---------------------------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export async function runDescribeMedia(deps: ComposeDeps, mediaId: string) {
  const { store } = deps
  const media = await store.media(mediaId)
  if (!media || media.alt_status !== 'pending') return 'skipped'
  const fail = async (error: string) => {
    await store.updateMedia(mediaId, { alt_status: 'failed', alt_error: error })
    return error
  }
  const composition = await store.composition(media.composition_id)
  if (!composition) return fail('unexpected')
  const { config, monthly_budget_usd } = composition.topic
  const langs = config.output_langs.filter((lang) => !media.alt[lang]?.trim())
  if (!langs.length) {
    await store.updateMedia(mediaId, { alt_status: 'idle', alt_error: null })
    return 'nothing_to_do'
  }
  if ((await store.monthCostUsd(composition.topic_id)) >= monthly_budget_usd)
    return fail('budget_exceeded')
  const apiKey = await store.key(composition.workspace_id, 'anthropic')
  if (!apiKey)
    return fail(
      (await store.missingKeyError?.(composition.workspace_id, 'anthropic')) ??
        errorCode('missing_credential', 'anthropic'),
    )

  const bytes = await store.mediaBytes(media.storage_path)
  const model = config.ai.draft_model
  const result = await deps.model<{ alt: Record<string, string> }>({
    apiKey,
    model,
    effort: 'low',
    system: altSystemPrompt(langs),
    content: [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: media.mime as 'image/jpeg' | 'image/png' | 'image/webp',
          data: toBase64(bytes),
        },
      },
      {
        type: 'text',
        text: composition.subject.trim()
          ? `The post is about: ${composition.subject.trim()}`
          : 'Write the text alternative of this image.',
      },
    ],
    schema: altOutputSchema(langs),
  })
  const usage = usageEntry('alt_text', ALT_PROMPT_VERSION, result, model)
  if (usage) await store.logUsage(composition, usage)
  if (!result.ok) return fail(result.error)

  // Only the languages still empty: a text the person wrote meanwhile is kept.
  const fresh = (await store.media(mediaId)) ?? media
  const alt = { ...fresh.alt }
  const proposed = new Set(fresh.alt_proposed)
  for (const lang of langs) {
    const text = result.output.alt[lang]?.trim()
    if (text && !alt[lang]?.trim()) {
      alt[lang] = text
      proposed.add(lang)
    }
  }
  await store.updateMedia(mediaId, {
    alt,
    alt_proposed: [...proposed],
    alt_status: 'idle',
    alt_error: null,
  })
  return 'done'
}
