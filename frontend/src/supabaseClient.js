import { createClient } from '@supabase/supabase-js'

/** For verified-only access: Supabase Dashboard → Authentication → Providers → Email → enable “Confirm email”. */

const supabaseUrl = typeof import.meta.env.VITE_SUPABASE_URL === 'string' ? import.meta.env.VITE_SUPABASE_URL.trim() : ''
const supabaseAnonKey =
  typeof import.meta.env.VITE_SUPABASE_ANON_KEY === 'string' ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim() : ''

/**
 * True when real Supabase credentials are present at build time.
 * If false, `supabase` uses a placeholder client so the bundle does not throw on import
 * (createClient('', '') throws "supabaseUrl is required" — which caused a blank page on Vercel without env vars).
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  console.error(
    'Dorm2Door: Missing Supabase env. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (e.g. in Vercel → Settings → Environment Variables), then redeploy.'
  )
}

/** Placeholder values satisfy createClient(); real requests must be gated on isSupabaseConfigured. */
const PLACEHOLDER_URL = 'https://invalid-placeholder.supabase.co'
const PLACEHOLDER_KEY = 'sb-placeholder-anon-key-not-for-production'

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : PLACEHOLDER_URL,
  isSupabaseConfigured ? supabaseAnonKey : PLACEHOLDER_KEY
)

/**
 * URL Supabase puts in confirmation emails (defaults to Dashboard Site URL if omitted).
 * In the browser, uses the current origin so production users are not sent to localhost.
 * On Vercel, set VITE_SITE_URL (e.g. https://your-app.vercel.app) for non-browser contexts.
 * Add the same URL(s) under Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export function getAuthEmailRedirectTo() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  const fromEnv = import.meta.env.VITE_SITE_URL
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, '')
  }
  return undefined
}
