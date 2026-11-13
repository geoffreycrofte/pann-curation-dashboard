import { ref } from 'vue'

export interface Toast {
  id: number
  text: string
}

/** Confirmations shown by the Toaster (App.vue). Errors stay next to their form. */
export const toasts = ref<Toast[]>([])
let next = 1

/** How long a confirmation stays, unless the pointer or the focus is on it. */
export const TOAST_MS = 5000

/** Shows a success confirmation ("Saved."). */
export function toast(text: string) {
  // The same confirmation twice in a row (two saves): keep one.
  toasts.value = [...toasts.value.filter((t) => t.text !== text), { id: next++, text }].slice(-3)
}

export function dismissToast(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}
