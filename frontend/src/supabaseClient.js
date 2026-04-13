import { createClient } from '@supabase/supabase-js'

/** For verified-only access: Supabase Dashboard → Authentication → Providers → Email → enable “Confirm email”. */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Dorm2Door: Missing Supabase env. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env (see .env.example).'
  )
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')

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
