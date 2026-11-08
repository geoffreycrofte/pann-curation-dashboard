import { ref } from 'vue'

export type Theme = 'light' | 'dark'

/** Also read by the inline script of index.html, which applies it before the first paint. */
const STORAGE_KEY = 'pann.theme'
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

function storedTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

/** The theme picked by the person, or null to follow the system. */
const chosen = ref<Theme | null>(storedTheme())
const systemIsDark = ref(systemDark.matches)
systemDark.addEventListener('change', (event) => {
  systemIsDark.value = event.matches
})

export function isDark(): boolean {
  return chosen.value ? chosen.value === 'dark' : systemIsDark.value
}

function apply() {
  // tokens.css: color-scheme light, dark, or both (system) on <html>.
  if (chosen.value) document.documentElement.dataset.theme = chosen.value
  else delete document.documentElement.dataset.theme
}

/** Swaps to the other theme and remembers the choice on this device. */
export function toggleTheme() {
  chosen.value = isDark() ? 'light' : 'dark'
  apply()
  try {
    localStorage.setItem(STORAGE_KEY, chosen.value)
  } catch {
    // storage unavailable: the choice lasts until the page is reloaded
  }
}

apply()
