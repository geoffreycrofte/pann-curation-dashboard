import type { TopicConfig } from './topic-config'

/** At most this many images per composed post: the most Bluesky takes in one post. */
export const MAX_COMPOSE_IMAGES = 4
/**
 * Largest image stored, in bytes: Bluesky's limit per image (maxSize of
 * app.bsky.embed.images in @atproto/api 0.32.2, checked 2026-11-19), the lowest of the
 * networks. The board resizes and compresses images to fit before uploading them.
 */
export const MAX_IMAGE_BYTES = 2_000_000
/** Longest side of a stored image, in pixels. */
export const MAX_IMAGE_SIDE = 2048
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
/** Longest text alternative kept (Bluesky's app caps it at 2,000 characters). */
export const MAX_ALT_LENGTH = 1500

/** Schedule of the Création tool: its own slots, in the topic's time zone. */
export function composeSchedule(config: TopicConfig): TopicConfig['schedule'] {
  return {
    ...config.schedule,
    posts_per_day: config.compose.posts_per_day,
    slots: config.compose.slots,
  }
}

export interface ComposeMediaAlt {
  alt: Record<string, string>
}

/** Languages in which an image still lacks its text alternative (needed to publish). */
export function missingAlt(media: readonly ComposeMediaAlt[], langs: readonly string[]): string[] {
  return langs.filter((lang) => media.some((m) => !m.alt[lang]?.trim()))
}
