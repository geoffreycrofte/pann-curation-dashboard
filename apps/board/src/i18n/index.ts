import { UI_LANGS, type UiLang } from '@glimr/shared'
import { createI18n } from 'vue-i18n'
import en from './en'
import fr from './fr'

const STORAGE_KEY = 'glimr.lang'

function initialLang(): UiLang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (UI_LANGS as readonly string[]).includes(stored)) return stored as UiLang
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

export function setLang(lang: UiLang) {
  i18n.global.locale.value = lang
  document.documentElement.lang = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // ignore
  }
}

document.documentElement.lang = i18n.global.locale.value
