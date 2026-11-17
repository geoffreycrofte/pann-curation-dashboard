import { z } from 'zod'

/** Languages of the interface (board, service emails). Contents can be in any language. */
export const UI_LANGS = ['fr', 'en'] as const
export type UiLang = (typeof UI_LANGS)[number]

/**
 * Language of a content (summaries, posts, newsletter, feeds): a BCP 47 tag, `fr`,
 * `de`, `pt-BR`, `zh-Hant`… Any language the AI writes, whatever the interface language.
 */
export type Lang = string

/** Language, optional script and optional region: enough for every content Pann writes. */
const LANG_TAG = /^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?$/i

/** At most this many languages per topic: each one is a summary and a post per network. */
export const MAX_OUTPUT_LANGS = 6

/** Canonical form of a tag (`PT-br` → `pt-BR`), or null when it is not a language tag. */
export function canonicalLang(value: string): Lang | null {
  const tag = value.trim()
  if (!LANG_TAG.test(tag)) return null
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? null
  } catch {
    return null
  }
}

export const langSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const lang = canonicalLang(value)
    if (!lang) {
      ctx.addIssue({ code: 'custom', message: 'Invalid language tag' })
      return z.NEVER
    }
    return lang
  })

export function isUiLang(lang: string): lang is UiLang {
  return (UI_LANGS as readonly string[]).includes(lang)
}

/** Interface language closest to a content language (its own, else English). */
export function uiLangFor(lang: Lang): UiLang {
  const base = lang.split('-')[0]!
  return isUiLang(base) ? base : 'en'
}

/**
 * Languages offered first in the pickers (ISO 639-1, plus two regional variants).
 * Any other tag can be typed: this list only saves searching.
 */
export const COMMON_LANGS: readonly Lang[] = [
  'ar',
  'bg',
  'ca',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'es',
  'et',
  'eu',
  'fi',
  'fr',
  'ga',
  'he',
  'hi',
  'hr',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'lb',
  'lt',
  'lv',
  'ms',
  'mt',
  'nl',
  'no',
  'pl',
  'pt',
  'pt-BR',
  'ro',
  'ru',
  'sk',
  'sl',
  'sr',
  'sv',
  'th',
  'tr',
  'uk',
  'vi',
  'zh',
  'zh-Hant',
]

/** Name of a language, written in `inLang` (`de` in French: « allemand »). */
export function langName(lang: Lang, inLang: string): string {
  try {
    return new Intl.DisplayNames([inLang], { type: 'language' }).of(lang) ?? lang
  } catch {
    return lang
  }
}

/** A text written by the user in each content language (newsletter name, signature…). */
export const localizedText = (max: number) =>
  z.record(langSchema, z.string().trim().max(max)).default({})

export type LocalizedText = Record<Lang, string>

/** Name of a topic for a content language: its French or English name (interface names). */
export function nameIn(topic: { name_fr: string; name_en: string }, lang: Lang): string {
  return uiLangFor(lang) === 'fr' ? topic.name_fr : topic.name_en
}
