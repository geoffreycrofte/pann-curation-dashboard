import type { Directive } from 'vue'

/**
 * Tab rows scroll sideways on small screens: keep the current tab in view (it may be
 * off screen after a navigation). Horizontal only, so the page never jumps.
 */
function reveal(row: HTMLElement) {
  if (row.scrollWidth <= row.clientWidth) return
  const active = row.querySelector<HTMLElement>('[aria-current="page"], [data-state="active"]')
  if (!active) return
  const rowBox = row.getBoundingClientRect()
  const box = active.getBoundingClientRect()
  if (box.left >= rowBox.left && box.right <= rowBox.right) return
  row.scrollLeft += box.left - rowBox.left - (rowBox.width - box.width) / 2
}

export const vScrollActive: Directive<HTMLElement> = {
  mounted: (el) => requestAnimationFrame(() => reveal(el)),
  updated: (el) => requestAnimationFrame(() => reveal(el)),
}
