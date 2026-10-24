import { LANGS, type Lang } from '@pann/shared'
import { createI18n } from 'vue-i18n'
import en from './en'
import fr from './fr'

const STORAGE_KEY = 'pann.lang'

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (LANGS as readonly string[]).includes(stored)) return stored as Lang
  } catch {
    // storage unavailable: fall through
  }
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLang(),
  fallbackLocale: 'en',
  messages: { fr, en },
})

export function setLang(lang: Lang) {
  i18n.global.locale.value = lang
  document.documentElement.lang = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // ignore
  }
}

document.documentElement.lang = i18n.global.locale.value
