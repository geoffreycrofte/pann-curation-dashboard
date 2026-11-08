// Checks the contrast of the token pairs used by the board, in both themes.
// Usage: node scripts/check-contrast.mjs  (exits 1 on failure)
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')

/** Colors of one theme: `--name: light-dark(#light, #dark)` or `--name: #same`. */
function tokens(theme) {
  return Object.fromEntries(
    [
      ...css.matchAll(
        /--([\w-]+):\s*(?:light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)|(#[0-9a-f]{6}))/gi,
      ),
    ].map((m) => [m[1], m[4] ?? (theme === 'light' ? m[2] : m[3])]),
  )
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [foreground, background, minimum]
const PAIRS = [
  ['color-text', 'color-bg', 4.5],
  ['color-text', 'color-surface', 4.5],
  ['color-text', 'color-surface-2', 4.5],
  ['color-text', 'color-accent-soft', 4.5],
  ['color-text-muted', 'color-bg', 4.5],
  ['color-text-muted', 'color-surface', 4.5],
  ['color-text-muted', 'color-surface-2', 4.5],
  ['color-accent-text', 'color-bg', 4.5],
  ['color-accent-text', 'color-surface', 4.5],
  ['color-accent-text', 'color-surface-2', 4.5],
  ['color-on-accent', 'color-accent-fill', 4.5],
  ['color-text-muted', 'color-accent-soft', 4.5],
  ['color-text', 'color-neutral-soft', 4.5],
  ['color-text', 'color-success-soft', 4.5],
  ['color-text', 'color-danger-soft', 4.5],
  ['color-surface', 'color-text', 4.5],
  ['color-danger', 'color-surface-2', 4.5],
  ['color-on-ink', 'color-ink', 4.5],
  ['color-on-ink-muted', 'color-ink', 4.5],
  ['color-accent-on-ink', 'color-ink', 4.5],
  ['color-success', 'color-surface', 4.5],
  ['color-danger', 'color-surface', 4.5],
  ['color-success', 'color-bg', 4.5],
  ['color-danger', 'color-bg', 4.5],
  ['color-border', 'color-bg', 3],
  ['color-border', 'color-surface', 3],
  ['color-focus', 'color-bg', 3],
  ['color-focus', 'color-surface', 3],
  ['color-focus-on-ink', 'color-ink', 3],
  ['color-accent-fill', 'color-ink', 3],
]

let failed = false
for (const name of ['light', 'dark']) {
  const t = tokens(name)
  for (const [fg, bg, min] of PAIRS) {
    const r = ratio(t[fg], t[bg])
    const ok = r >= min
    failed ||= !ok
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(5)} ${fg} on ${bg}: ${r.toFixed(2)} (min ${min})`,
    )
  }
}
process.exit(failed ? 1 : 0)
