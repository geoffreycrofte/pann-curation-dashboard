import { watch } from 'vue'
import { i18n } from '../i18n'
import { session } from './session'
import { supabase } from './supabase'

/**
 * Keeps the interface language in the account (user_metadata.lang), for the e-mails: those
 * Glimr sends and those of Supabase (sign-in link, change of address) are written in it.
 * The browser stays the reference; the account only follows it.
 */
export function syncLangToAccount() {
  watch(
    [
      () => session.value?.user.user_metadata?.lang as string | undefined,
      () => i18n.global.locale.value,
    ],
    ([saved, current]) => {
      if (!session.value || saved === current) return
      void supabase.auth.updateUser({ data: { lang: current } })
    },
    { immediate: true },
  )
}
