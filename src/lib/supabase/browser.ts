import { createBrowserClient } from '@supabase/ssr'

// Browser Supabase client. Reads cookies from document.cookie via the SSR
// helper so sessions stay in sync with the server client.
let _client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseBrowserClient() {
  if (_client) return _client
  _client = createBrowserClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
  return _client
}
