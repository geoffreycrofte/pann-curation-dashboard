import type { Session } from '@supabase/supabase-js'
import { ref } from 'vue'
import { supabase } from './supabase'

export const session = ref<Session | null>(null)

let ready: Promise<void> | undefined

/** Resolves once the initial session is known; keeps `session` in sync afterwards. */
export function initSession(): Promise<void> {
  ready ??= supabase.auth.getSession().then(({ data }) => {
    session.value = data.session
    supabase.auth.onAuthStateChange((_event, s) => {
      session.value = s
    })
  })
  return ready
}
