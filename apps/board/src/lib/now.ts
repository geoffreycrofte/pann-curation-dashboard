import { onBeforeUnmount, onMounted, ref } from 'vue'

/** How often the current time is read again: free slots pass at the minute. */
const TICK_MS = 30_000

/**
 * The current time, kept up to date while the component is shown: a page left open
 * moves on with the clock (past slots go away, today becomes tomorrow at midnight).
 */
export function useNow() {
  const now = ref(new Date())
  let timer: ReturnType<typeof setInterval> | undefined
  const tick = () => {
    now.value = new Date()
  }
  onMounted(() => {
    timer = setInterval(tick, TICK_MS)
    // Back on a tab the browser slowed down: catch up at once.
    document.addEventListener('visibilitychange', tick)
  })
  onBeforeUnmount(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', tick)
  })
  return now
}
