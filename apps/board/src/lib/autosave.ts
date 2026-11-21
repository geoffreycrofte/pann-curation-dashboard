import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'invalid' | 'error'

/** Pause in typing after which a change is saved. */
export const AUTOSAVE_MS = 1000

/**
 * Saves an edited value by itself: a moment after the last change, on `flush()` (blur,
 * before an action that needs it) and when the component goes away. One save at a time;
 * a change made during a save is saved right after it.
 */
export function useAutosave<T>(options: {
  /** The value being edited. */
  value: () => T
  /** The value as stored (props from the server). */
  stored: () => T
  save: (value: T) => Promise<unknown>
  /** False while the value cannot be saved yet (an empty required text). */
  valid?: () => boolean
  delay?: number
}) {
  const key = (value: T) => JSON.stringify(value) ?? 'null'
  /** Last value saved, until the stored value catches up with it. */
  const lastSaved = ref<string | null>(null)
  const dirty = computed(() => {
    const current = key(options.value())
    return current !== key(options.stored()) && current !== lastSaved.value
  })

  const state = ref<AutosaveState>('idle')
  const error = ref<unknown>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | null = null
  let again = false

  async function run() {
    if (!dirty.value) {
      if (state.value === 'pending' || state.value === 'invalid') state.value = 'idle'
      return
    }
    if (options.valid && !options.valid()) {
      state.value = 'invalid'
      return
    }
    // A copy: the edited value may change while the request runs.
    const snapshot = key(options.value())
    state.value = 'saving'
    try {
      await options.save(JSON.parse(snapshot) as T)
      lastSaved.value = snapshot
      error.value = null
      state.value = dirty.value ? 'pending' : 'saved'
    } catch (err) {
      error.value = err
      state.value = 'error'
    }
  }

  /** Saves now if something changed; waits for a save already running. */
  async function flush(): Promise<void> {
    clearTimeout(timer)
    if (running) {
      again = true
      return running
    }
    running = run().finally(() => {
      running = null
      if (again) {
        again = false
        void flush()
      }
    })
    return running
  }

  watch(
    () => key(options.value()),
    () => {
      if (!dirty.value) return
      state.value = 'pending'
      clearTimeout(timer)
      timer = setTimeout(() => void flush(), options.delay ?? AUTOSAVE_MS)
    },
  )

  // Closing the tab with a change not yet saved: the browser asks first.
  const guard = (event: BeforeUnloadEvent) => {
    if (dirty.value || running) event.preventDefault()
  }
  onMounted(() => window.addEventListener('beforeunload', guard))
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', guard)
    void flush()
  })

  return { state, error, dirty, flush }
}
