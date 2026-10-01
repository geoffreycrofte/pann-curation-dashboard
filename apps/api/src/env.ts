import type { SupabaseClient } from '@supabase/supabase-js'

export interface Env {
  ASSETS: Fetcher
  SUPABASE_URL: string
  /** Public key (anon / publishable): requests run with the user's JWT and RLS applies. */
  SUPABASE_PUBLISHABLE_KEY: string
  /** Secret key (service role): background jobs only, bypasses RLS. Never used for user requests. */
  SUPABASE_SECRET_KEY: string
}

export interface AuthUser {
  id: string
  email: string | undefined
}

export interface AppVariables {
  user: AuthUser
  /** Supabase client bound to the user's JWT. */
  db: SupabaseClient
}

export type AppEnv = { Bindings: Env; Variables: AppVariables }
