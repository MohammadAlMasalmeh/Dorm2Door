import { createClient } from '@supabase/supabase-js'

/** For verified-only access: Supabase Dashboard → Authentication → Providers → Email → enable “Confirm email”. */

const supabaseUrl = typeof import.meta.env.VITE_SUPABASE_URL === 'string' ? import.meta.env.VITE_SUPABASE_URL.trim() : ''
const supabaseAnonKey =
  typeof import.meta.env.VITE_SUPABASE_ANON_KEY === 'string' ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim() : ''

const configured = Boolean(supabaseUrl && supabaseAnonKey)

if (!configured) {
  console.error(
    'Dorm2Door: Missing Supabase env. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_URL and SUPABASE_ANON_KEY on Vercel), then redeploy. See vite.config.js.'
  )
}

/** Placeholder avoids createClient("", "") which throws and whitescreens the app. */
const PLACEHOLDER_URL = 'https://invalid-placeholder.supabase.co'
const PLACEHOLDER_KEY = 'sb-placeholder-anon-key-not-for-production'

export const supabase = createClient(
  configured ? supabaseUrl : PLACEHOLDER_URL,
  configured ? supabaseAnonKey : PLACEHOLDER_KEY
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
