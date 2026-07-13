import { createServerClient, parseCookieHeader } from '@supabase/ssr'
import type { AstroCookies } from 'astro'

// Server-side Supabase client bound to the current request's cookies.
// Use inside Astro pages, endpoints, and middleware. This client respects
// RLS as the signed-in user (or anon if no session).
export function createSupabaseServerClient(
  request: Request,
  cookies: AstroCookies
) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get('Cookie') ?? '').map(
            (c) => ({ name: c.name, value: c.value ?? '' })
          )
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookies.set(name, value, options)
          })
        }
      }
    }
  )
}
