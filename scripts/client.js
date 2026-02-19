/**
 * client.js — Supabase client factory for Dorm2Door
 *
 * Exports two clients:
 *   anonClient       — respects RLS; use this to simulate a logged-in user
 *   adminClient      — bypasses RLS via service_role key; use for seeding / admin ops
 */
require('dotenv').config({ path: __dirname + '/.env' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY     = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error('Missing Supabase env vars. Check scripts/.env');
}

/** Anon client — honours Row Level Security */
const anonClient = createClient(SUPABASE_URL, ANON_KEY);

/** Admin client — bypasses RLS (service_role). Never expose this on the frontend. */
const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = { anonClient, adminClient, SUPABASE_URL };
