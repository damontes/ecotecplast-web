import { createClient } from '@supabase/supabase-js'

// Service-role client. Bypasses RLS. Server-only — never import from
// browser code or `.astro` component script blocks that run client-side.
// Use only for privileged operations that must happen on behalf of the
// system (e.g. seeding, cross-user reads, background jobs).
export function createSupabaseAdminClient() {
  const key = import.meta.env.SUPABASE_SECRET_KEY
  if (!key) {
    throw new Error('SUPABASE_SECRET_KEY is not set')
  }
  return createClient(import.meta.env.PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}
