import { defineMiddleware } from 'astro:middleware'
import { verifyUserFromRequest } from '@/lib/supabase/verify-jwt'
import { readProfileCache, writeProfileCache } from '@/lib/supabase/admin-cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Middleware runs on every server request. We use it to:
//   1. Resolve the current user + admin flag + organization once and put
//      them on `locals.user`.
//   2. Gate the /dashboard/* section behind an admin session.
//
// Perf notes:
//   * User identity: verified LOCALLY via jose + Supabase's JWKS. No
//     network round-trip. ~3–5 ms per request.
//   * is_admin + organization_id: read from a process-local 30 s TTL
//     cache; on miss we do one DB query and write it back. Most
//     navigations skip the DB.
//
// Same security posture as calling supabase.auth.getUser() every time:
// the JWT is still cryptographically verified against Supabase's public
// keys. If the signing keys rotate, jose refetches JWKS automatically.
//
// Note: any page that must be gated MUST be SSR (no `export const prerender = true`),
// otherwise middleware never runs for it.
export const onRequest = defineMiddleware(async (context, next) => {
  const { request, cookies, url, redirect, locals } = context

  const user = await verifyUserFromRequest(request)

  if (user) {
    let profile = readProfileCache(user.id)
    if (!profile) {
      // Under the multi-tenant schema (migration 005), a user's "is admin"
      // status is a per-org role in `organization_members`, not a global
      // flag on `profiles`. Read the first membership (users have a single
      // org today) and derive isAdmin from role.
      const supabase = createSupabaseServerClient(request, cookies)
      const { data } = await supabase
        .from('organization_members')
        .select('org_id, role')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      profile = {
        isAdmin: data?.role === 'admin',
        organizationId: Number(data?.org_id ?? 0)
      }
      writeProfileCache(user.id, profile)
    }

    locals.user = {
      id: user.id,
      email: user.email,
      isAdmin: profile.isAdmin,
      organizationId: profile.organizationId
    }
  } else {
    locals.user = null
  }

  const isDashboardRoute = url.pathname.startsWith('/dashboard')
  const isDashboardApi =
    url.pathname.startsWith('/api/color-match') ||
    url.pathname.startsWith('/api/masterbatches') ||
    url.pathname.startsWith('/api/providers') ||
    url.pathname.startsWith('/api/clients') ||
    url.pathname.startsWith('/api/color-references') ||
    url.pathname.startsWith('/api/jobs')

  if (isDashboardRoute) {
    if (!locals.user) {
      return redirect(`/login?next=${encodeURIComponent(url.pathname)}`)
    }
    if (!locals.user.isAdmin) {
      return redirect('/login?error=forbidden')
    }
    if (!locals.user.organizationId) {
      // Extremely unusual: authenticated + admin but no org row on
      // profile. Almost certainly a bad manual DB edit. Refuse to serve
      // rather than crashing every downstream query.
      return new Response('Cuenta sin organización asignada — contacta al administrador.', {
        status: 500
      })
    }
  }

  if (isDashboardApi) {
    if (!locals.user || !locals.user.isAdmin || !locals.user.organizationId) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  return next()
})
