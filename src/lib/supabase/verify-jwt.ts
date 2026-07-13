// Local JWT verification against Supabase's published JWKS.
//
// Why not supabase.auth.getUser()? getUser() makes a network round-trip to
// Supabase Auth to validate the JWT on every request (~150–400 ms). By
// verifying the signature locally against the JWKS (public keys published
// by the same Auth server), we get the same cryptographic guarantee at
// ~3–5 ms per request. The JWKS is fetched once per server process and
// cached in memory by jose.
//
// If Supabase rotates their signing keys, jose transparently re-fetches
// (default cool-off: 30 s), so no manual reload is needed.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { parseCookieHeader } from '@supabase/ssr'

export interface VerifiedUser {
  id: string
  email: string
  raw: JWTPayload
}

// Lazily initialise the JWKS on first use so we don't hit the network at
// module import time (Vercel's cold-start does that already once per
// isolate, but keeping the URL derivation lazy is friendlier for tests).
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function getJwks() {
  if (_jwks) return _jwks
  const explicit = import.meta.env.SUPABASE_JWKS_URL
  const url = explicit
    ? new URL(explicit)
    : new URL('/auth/v1/.well-known/jwks.json', import.meta.env.PUBLIC_SUPABASE_URL)
  _jwks = createRemoteJWKSet(url, {
    cacheMaxAge: 10 * 60 * 1000, // 10 min in-memory cache
    cooldownDuration: 30 * 1000 // 30 s before refetching on key miss
  })
  return _jwks
}

/**
 * Parse the Supabase auth cookies from a request and verify the JWT.
 * Returns null if there's no session, the token is invalid, or expired.
 * NEVER throws — auth failures always fall through to "no user".
 */
export async function verifyUserFromRequest(request: Request): Promise<VerifiedUser | null> {
  const cookieHeader = request.headers.get('Cookie') ?? ''
  if (!cookieHeader) return null

  const jwt = extractSupabaseJwt(cookieHeader)
  if (!jwt) return null

  try {
    const issuer = import.meta.env.PUBLIC_SUPABASE_URL.replace(/\/$/, '') + '/auth/v1'
    const { payload } = await jwtVerify(jwt, getJwks(), { issuer })
    const sub = payload.sub
    if (!sub) return null
    return {
      id: sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      raw: payload
    }
  } catch {
    return null
  }
}

/**
 * The @supabase/ssr session cookie is either a single JWT cookie (legacy)
 * or a chunked-cookie set (auth-token.0, auth-token.1, ...). Handle both.
 */
function extractSupabaseJwt(cookieHeader: string): string | null {
  const cookies = parseCookieHeader(cookieHeader)
  // Cookie name pattern from @supabase/ssr: sb-<projectRef>-auth-token
  // (plus optional .N suffix on chunks).
  const authTokenCookies = cookies
    .filter((c) => /^sb-[^-]+-auth-token(?:\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (authTokenCookies.length === 0) return null

  const joined = authTokenCookies.map((c) => c.value ?? '').join('')
  const raw = tryDecodeBase64Prefixed(joined) ?? joined

  // The cookie value is a JSON array from supabase-js: [access_token, refresh_token, ...]
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0]
    if (typeof parsed === 'object' && typeof parsed?.access_token === 'string') {
      return parsed.access_token
    }
  } catch {
    // Some legacy formats store the JWT directly.
    if (raw.split('.').length === 3) return raw
  }
  return null
}

function tryDecodeBase64Prefixed(value: string): string | null {
  const marker = 'base64-'
  if (!value.startsWith(marker)) return null
  try {
    const b64 = value.slice(marker.length)
    // atob is available in Vercel Node runtimes and Bun.
    return typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8')
  } catch {
    return null
  }
}
