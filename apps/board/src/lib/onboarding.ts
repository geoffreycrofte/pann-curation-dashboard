import type { DraftChannel } from '@pann/shared'
import { reactive, watch } from 'vue'

/** Networks Pann publishes to, in the order shown at onboarding. */
export const PUBLISH_CHANNELS: readonly DraftChannel[] = [
  'linkedin',
  'facebook',
  'bluesky',
  'mastodon',
  'discord',
]
/** Where the conversations tool listens (engagement sources). */
export const LISTEN_PLATFORMS = ['hackernews', 'bluesky'] as const
export type ListenPlatform = (typeof LISTEN_PLATFORMS)[number]

/**
 * What the person answers while creating a topic. Nothing is saved before the review
 * step: this draft lives in the session (it survives a reload, not a closed tab).
 */
export interface OnboardingDraft {
  // Goal
  name: string
  url: string
  curation: boolean
  engagement: boolean
  /** "Create my own posts" is not there yet: ticking it asks to be told when it is. */
  composeInterest: boolean
  // Networks
  channels: DraftChannel[]
  newsletter: boolean
  feed: boolean
  otherNetwork: boolean
  otherNetworkName: string
  listen: ListenPlatform[]
  // Review
  nameEn: string
  description: string
  audience: string
  langs: string[]
  criteria: string
  engagementCriteria: string
  styleRules: string
  postsPerDay: number
  slots: string
  budget: number
}

const STORAGE_KEY = 'pann.onboarding'

export function emptyDraft(): OnboardingDraft {
  return {
    name: '',
    url: '',
    curation: false,
    engagement: false,
    composeInterest: false,
    channels: [],
    newsletter: false,
    feed: false,
    otherNetwork: false,
    otherNetworkName: '',
    listen: [],
    nameEn: '',
    description: '',
    audience: '',
    langs: ['fr', 'en'],
    criteria: '',
    engagementCriteria: '',
    styleRules: '',
    postsPerDay: 2,
    slots: '09:00, 16:00',
    budget: 10,
  }
}

function stored(): OnboardingDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? { ...emptyDraft(), ...(JSON.parse(raw) as Partial<OnboardingDraft>) } : null
  } catch {
    return null
  }
}

/** The draft of the topic being created, kept in sessionStorage while it is edited. */
export function useOnboardingDraft() {
  const draft = reactive<OnboardingDraft>(stored() ?? emptyDraft())
  watch(
    draft,
    (value) => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        // storage unavailable: the draft lives until the page is left
      }
    },
    { deep: true },
  )
  function clear() {
    Object.assign(draft, emptyDraft())
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // nothing to clear
    }
  }
  return { draft, clear }
}

/** "09:00, 16:00" → ['09:00', '16:00']; null when a time is not HH:MM. */
export function parseSlots(text: string): string[] | null {
  const slots = text
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return slots.every((s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s)) ? slots : null
}

/** "example.org" → "https://example.org"; empty stays empty. */
export function siteUrl(text: string): string {
  const value = text.trim()
  if (!value) return ''
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

/** The first settings of the topic, as the API takes them (any part of a topic config). */
export function draftConfig(draft: OnboardingDraft) {
  return {
    modules: { curation: draft.curation, engagement: draft.engagement },
    output_langs: draft.langs,
    target_channels: draft.channels,
    product: {
      name: draft.name.trim(),
      url: siteUrl(draft.url),
      description: draft.description.trim(),
      audience: draft.audience.trim(),
    },
    ai: { relevance_criteria: draft.criteria.trim(), style_rules: draft.styleRules.trim() },
    engagement: { criteria: draft.engagementCriteria.trim() },
    schedule: { posts_per_day: draft.postsPerDay, slots: parseSlots(draft.slots) ?? [] },
  }
}
