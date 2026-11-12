import {
  accountFor,
  composePost,
  errorCode,
  type DraftChannel,
  type Lang,
  type TopicConfig,
} from '@pann/shared'
import type { BlueskyAccount, DiscordWebhook } from './direct'
import type { MastodonAccount, PublishRequest, PublishResult } from './networks'

export interface DuePost {
  id: string
  item_id: string
  topic_id: string
  workspace_id: string
  channel: DraftChannel
  lang: Lang | null
  body: string
  publish_attempts: number
  canonical_url: string
  topic_config: TopicConfig
}

export interface PublishCredentials {
  zernio?: string
  mastodon?: MastodonAccount
  bluesky?: BlueskyAccount
  discord?: DiscordWebhook
}

/** Who publishes a channel: Zernio for the networks with app review, the others directly. */
export type PublishService = 'zernio' | 'mastodon' | 'bluesky' | 'discord'

export interface PublishStore {
  /** Takes the due posts; another run will not take them for 10 minutes. */
  claimDue(limit: number): Promise<DuePost[]>
  credentials(workspaceId: string): Promise<PublishCredentials>
  markSent(post: DuePost, result: { external_id: string | null; url: string | null }): Promise<void>
  /** final: the post fails for good (status failed); else it is scheduled again at `retryAt`. */
  markFailed(post: DuePost, error: string, final: boolean, retryAt?: Date): Promise<void>
  /** Leaves the post scheduled, to be taken again after `retryAt` (rate limits). */
  release(post: DuePost, retryAt: Date): Promise<void>
  markCredentialInvalid(workspaceId: string, provider: PublishService): Promise<void>
  /** An item whose posts have all left the queue, with at least one sent, is published. */
  finishItem(topicId: string, itemId: string): Promise<void>
}

export interface Networks {
  zernio(apiKey: string, accountId: string, request: PublishRequest): Promise<PublishResult>
  mastodon(account: MastodonAccount, request: PublishRequest): Promise<PublishResult>
  bluesky(
    account: BlueskyAccount,
    request: PublishRequest & { url: string },
  ): Promise<PublishResult>
  discord(webhook: DiscordWebhook, request: PublishRequest): Promise<PublishResult>
}

export const MAX_PUBLISH_ATTEMPTS = 3
export const MAX_POSTS_PER_RUN = 20
const RETRY_DELAY_MINUTES = 15

export interface PublishReport {
  sent: number
  failed: number
  retried: number
}

const provider = (channel: DraftChannel): PublishService =>
  channel === 'mastodon' || channel === 'bluesky' || channel === 'discord' ? channel : 'zernio'

/**
 * Publishes the posts whose slot has come. One post per channel and language, sent
 * to the account the topic settings give for that pair.
 */
export async function publish(deps: {
  store: PublishStore
  networks: Networks
  now?: () => Date
  limit?: number
}): Promise<PublishReport> {
  const now = deps.now ?? (() => new Date())
  const report: PublishReport = { sent: 0, failed: 0, retried: 0 }
  const posts = await deps.store.claimDue(deps.limit ?? MAX_POSTS_PER_RUN)
  const credentials = new Map<string, PublishCredentials>()
  /** workspace/provider pairs to leave alone for this run (bad key, rate limit). */
  const blocked = new Set<string>()
  const items = new Set<string>()
  const later = (attempt: number) =>
    new Date(now().getTime() + RETRY_DELAY_MINUTES * attempt * 60_000)

  for (const post of posts) {
    items.add(`${post.topic_id}/${post.item_id}`)
    const service = provider(post.channel)
    const blockKey = `${post.workspace_id}/${service}`
    if (blocked.has(blockKey)) {
      await deps.store.release(post, later(1))
      report.retried++
      continue
    }

    const account = post.lang ? accountFor(post.topic_config, post.channel, post.lang) : undefined
    if (!post.lang || !account) {
      await deps.store.markFailed(
        post,
        errorCode('channel_not_configured', `${post.channel}/${post.lang ?? ''}`),
        true,
      )
      report.failed++
      continue
    }

    if (!credentials.has(post.workspace_id))
      credentials.set(post.workspace_id, await deps.store.credentials(post.workspace_id))
    const keys = credentials.get(post.workspace_id)!

    const request: PublishRequest = {
      channel: post.channel,
      lang: post.lang,
      content: composePost(post.body, post.canonical_url),
      idempotencyKey: `pann-${post.id}-${post.publish_attempts}`,
    }
    const key = keys[service]
    if (!key) {
      await deps.store.markFailed(post, errorCode('missing_credential', service), true)
      report.failed++
      continue
    }
    const result: PublishResult =
      service === 'zernio'
        ? await deps.networks.zernio(keys.zernio!, account.account_id, request)
        : service === 'mastodon'
          ? await deps.networks.mastodon(keys.mastodon!, request)
          : service === 'bluesky'
            ? await deps.networks.bluesky(keys.bluesky!, { ...request, url: post.canonical_url })
            : await deps.networks.discord(keys.discord!, request)

    if (result.ok) {
      await deps.store.markSent(post, result)
      report.sent++
      continue
    }
    if (result.invalidCredential) {
      await deps.store.markCredentialInvalid(post.workspace_id, service)
      blocked.add(blockKey)
    }
    if (result.error.startsWith('rate_limited')) {
      blocked.add(blockKey)
      await deps.store.release(post, later(1))
      report.retried++
      continue
    }
    const attempt = post.publish_attempts + 1
    const final = !result.retry || attempt >= MAX_PUBLISH_ATTEMPTS
    await deps.store.markFailed(post, result.error, final, final ? undefined : later(attempt))
    if (final) report.failed++
    else report.retried++
  }

  for (const key of items) {
    const [topicId, itemId] = key.split('/') as [string, string]
    await deps.store.finishItem(topicId, itemId)
  }
  return report
}
