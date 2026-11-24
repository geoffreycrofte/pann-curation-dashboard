import { canonicalLang, MAX_OUTPUT_LANGS, type DraftChannel } from '@glimr/shared'
import type { OnboardingProposal } from './api'
import { inject, provide, reactive, watch, type InjectionKey } from 'vue'

/** Networks Glimr publishes to, in the order shown at onboarding. */
export const PUBLISH_CHANNELS: readonly DraftChannel[] = [
  'linkedin',
  'facebook',
  'bluesky',
  'mastodon',
  'discord',
  'telegram',
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
  /** Création tool: the person's own posts (modules.compose). */
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
  messages: string
  claimsToAvoid: string
  styleRules: string
  postRules: string
  postsPerDay: number
  slots: string
  budget: number
  // Conversation
  /** Session of the onboarding assistant, resumed on reload. */
  sessionId: string
  /** The assistant cannot run (no key, credit used): its questions are asked as text. */
  assistantOff: boolean
  /** Fields filled by the assistant and not edited since (marked at the review). */
  proposed: ProposedField[]
  /** Questions of the conversation already answered (or skipped). */
  answered: ThreadStep[]
}

/**
 * Questions of the creation conversation, in order. Fixed choices are closed questions;
 * what defines the topic (what it is, for whom, messages, voice) is the assistant's
 * part, or open questions when the assistant is not available.
 */
export type ThreadStep =
  | 'name'
  | 'url'
  | 'tools'
  | 'publish'
  | 'listen'
  | 'assistant'
  | 'description'
  | 'audience'
  | 'voice'
  | 'langs'
  | 'rhythm'
  | 'budget'

export function threadSteps(draft: OnboardingDraft, withAssistant: boolean): ThreadStep[] {
  return [
    'name',
    'url',
    'tools',
    ...(draft.curation || draft.composeInterest ? (['publish'] as const) : []),
    ...(draft.engagement ? (['listen'] as const) : []),
    ...(withAssistant
      ? (['assistant'] as const)
      : ([
          'description',
          'audience',
          ...(draft.curation || draft.composeInterest ? (['voice'] as const) : []),
        ] as const)),
    'langs',
    ...(draft.curation ? (['rhythm'] as const) : []),
    'budget',
  ]
}

/** Extra choices of the publishing question, next to the networks. */
export const PUBLISH_EXTRAS = ['newsletter', 'feed', 'other'] as const
export type PublishChoice = DraftChannel | (typeof PUBLISH_EXTRAS)[number]

export function publishChoices(draft: OnboardingDraft): PublishChoice[] {
  return [
    ...draft.channels,
    ...(draft.newsletter ? (['newsletter'] as const) : []),
    ...(draft.feed ? (['feed'] as const) : []),
    ...(draft.otherNetwork ? (['other'] as const) : []),
  ]
}

export function setPublishChoices(draft: OnboardingDraft, values: PublishChoice[]) {
  draft.channels = PUBLISH_CHANNELS.filter((c) => values.includes(c))
  draft.newsletter = values.includes('newsletter')
  draft.feed = values.includes('feed')
  draft.otherNetwork = values.includes('other')
}

/** The tools a topic can use, as chosen at its creation. */
export const TOOLS = ['curation', 'engagement', 'compose'] as const
export type Tool = (typeof TOOLS)[number]
export function toolChoices(draft: OnboardingDraft): Tool[] {
  return [
    ...(draft.curation ? (['curation'] as const) : []),
    ...(draft.engagement ? (['engagement'] as const) : []),
    ...(draft.composeInterest ? (['compose'] as const) : []),
  ]
}
export function setToolChoices(draft: OnboardingDraft, values: string[]) {
  draft.curation = values.includes('curation')
  draft.engagement = values.includes('engagement')
  draft.composeInterest = values.includes('compose')
}

export const PROPOSED_FIELDS = [
  'nameEn',
  'description',
  'audience',
  'messages',
  'claimsToAvoid',
  'langs',
  'criteria',
  'engagementCriteria',
  'styleRules',
  'postRules',
  'postsPerDay',
  'slots',
] as const
export type ProposedField = (typeof PROPOSED_FIELDS)[number]

const STORAGE_KEY = 'glimr.onboarding'

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
    messages: '',
    claimsToAvoid: '',
    styleRules: '',
    postRules: '',
    postsPerDay: 2,
    slots: '09:00, 16:00',
    budget: 10,
    sessionId: '',
    assistantOff: false,
    proposed: [],
    answered: [],
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

/**
 * Fills the draft with what the assistant proposed (non-empty values only) and marks
 * those fields, so that the review shows where each value comes from.
 */
export function applyProposal(draft: OnboardingDraft, proposal: Partial<OnboardingProposal>) {
  const text = (value: string | null | undefined) => (value ?? '').trim()
  const proposed = new Set(draft.proposed)
  const set = <K extends ProposedField>(field: K, value: OnboardingDraft[K] | null) => {
    if (value === null || value === '' || (Array.isArray(value) && !value.length)) return
    ;(draft[field] as OnboardingDraft[K]) = value
    proposed.add(field)
  }
  set('nameEn', text(proposal.name_en))
  set('description', text(proposal.description))
  set('audience', text(proposal.audience))
  set('messages', text(proposal.messages))
  set('claimsToAvoid', text(proposal.claims_to_avoid))
  set('criteria', text(proposal.relevance_criteria))
  set('engagementCriteria', text(proposal.engagement_criteria))
  set('styleRules', text(proposal.style_rules))
  set('postRules', text(proposal.post_rules))
  const langs = [
    ...new Set((proposal.output_langs ?? []).map(canonicalLang).filter((l) => l !== null)),
  ].slice(0, MAX_OUTPUT_LANGS)
  set('langs', langs.length ? langs : null)
  if (typeof proposal.posts_per_day === 'number')
    set('postsPerDay', Math.max(0, Math.min(10, Math.round(proposal.posts_per_day))))
  const slots = (proposal.slots ?? []).join(', ')
  set('slots', slots && parseSlots(slots) ? slots : null)
  draft.proposed = PROPOSED_FIELDS.filter((field) => proposed.has(field))
}

const DRAFT_KEY: InjectionKey<OnboardingDraft> = Symbol('onboarding-draft')
/** The creation page owns the draft; its conversation and summary share it. */
export function provideOnboardingDraft(draft: OnboardingDraft) {
  provide(DRAFT_KEY, draft)
}
export function injectOnboardingDraft(): OnboardingDraft {
  const draft = inject(DRAFT_KEY)
  if (!draft) throw new Error('No onboarding draft provided')
  return draft
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
    modules: {
      curation: draft.curation,
      engagement: draft.engagement,
      compose: draft.composeInterest,
    },
    output_langs: draft.langs,
    target_channels: draft.channels,
    target_newsletter: draft.curation && draft.newsletter,
    product: {
      name: draft.name.trim(),
      url: siteUrl(draft.url),
      description: draft.description.trim(),
      audience: draft.audience.trim(),
      messages: draft.messages.trim(),
      claims_to_avoid: draft.claimsToAvoid.trim(),
    },
    ai: {
      relevance_criteria: draft.criteria.trim(),
      style_rules: draft.styleRules.trim(),
      post_rules: draft.postRules.trim(),
    },
    engagement: { criteria: draft.engagementCriteria.trim() },
    schedule: { posts_per_day: draft.postsPerDay, slots: parseSlots(draft.slots) ?? [] },
  }
}
