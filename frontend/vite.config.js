import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Vite only exposes env vars prefixed with VITE_ to client code by default.
 * On Vercel, people often add SUPABASE_URL / SUPABASE_ANON_KEY (no prefix).
 * Map those into import.meta.env.VITE_* at build time so production keeps working.
 */
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, __dirname, '')
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    fileEnv.VITE_SUPABASE_URL ||
    fileEnv.SUPABASE_URL ||
    ''
  const supabaseAnonKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    fileEnv.VITE_SUPABASE_ANON_KEY ||
    fileEnv.SUPABASE_ANON_KEY ||
    ''

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
  }
})
