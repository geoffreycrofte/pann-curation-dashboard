import { langName } from '@pann/shared'
import { i18n } from '../i18n'

/**
 * Name of a content language in the interface language (« allemand », "German"), for any
 * language a topic writes in. Reactive in templates: it reads the current locale.
 */
export function contentLangName(lang: string | null | undefined): string {
  return lang ? langName(lang, i18n.global.locale.value) : ''
}
