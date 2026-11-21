import type { Directive } from 'vue'

/**
 * Tab rows scroll sideways on small screens, without a scrollbar: a fade at either end
 * says more tabs lie that way (`data-more-start`, `data-more-end`, styled in base.css).
 * The current tab is kept in view (it may be off screen after a navigation), and a
 * vertical mouse wheel scrolls the row while it can, as a mouse has no other way to.
 * Horizontal only, so the page never jumps.
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

/** Which ends hide tabs. Right-to-left rows scroll to negative values. */
function mark(row: HTMLElement) {
  const max = row.scrollWidth - row.clientWidth
  const done = Math.abs(row.scrollLeft)
  row.toggleAttribute('data-more-start', max > 1 && done > 1)
  row.toggleAttribute('data-more-end', max > 1 && done < max - 1)
}

function onWheel(this: HTMLElement, event: WheelEvent) {
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  const max = this.scrollWidth - this.clientWidth
  if (max <= 1) return
  // At an end, the page scrolls as usual.
  if ((event.deltaY < 0 && this.scrollLeft <= 0) || (event.deltaY > 0 && this.scrollLeft >= max)) {
    return
  }
  event.preventDefault()
  this.scrollLeft += event.deltaY
}

const observers = new WeakMap<HTMLElement, ResizeObserver>()
const onScroll = (event: Event) => mark(event.currentTarget as HTMLElement)

export const vScrollActive: Directive<HTMLElement> = {
  mounted(el) {
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    const observer = new ResizeObserver(() => mark(el))
    observer.observe(el)
    observers.set(el, observer)
    requestAnimationFrame(() => {
      reveal(el)
      mark(el)
    })
  },
  updated: (el) =>
    requestAnimationFrame(() => {
      reveal(el)
      mark(el)
    }),
  beforeUnmount(el) {
    el.removeEventListener('scroll', onScroll)
    el.removeEventListener('wheel', onWheel)
    observers.get(el)?.disconnect()
    observers.delete(el)
  },
}
