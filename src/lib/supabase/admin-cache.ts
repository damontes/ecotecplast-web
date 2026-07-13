// Tiny in-memory cache for the two profile fields middleware needs on
// every request: is_admin and organization_id. Keyed by user ID.
//
// Rationale: neither value changes often (admin flags flip rarely, and
// a user's org almost never changes), but middleware reads both on every
// request. A 30 s TTL means at most one stale request after a change —
// acceptable for this app, since a compromised-admin scenario is more
// reliably handled by DB rollback + session revocation than by hoping
// the cache expires quickly.
//
// Scope: process-local. Vercel functions can have multiple isolates
// warm at once, so different requests may see the cache at different
// staleness — that's fine because the TTL is short.

interface CachedProfile {
  isAdmin: boolean
  organizationId: number
}

interface Entry {
  value: CachedProfile
  expiresAt: number
}

const CACHE_TTL_MS = 30_000
const cache = new Map<string, Entry>()

export function readProfileCache(userId: string): CachedProfile | undefined {
  const entry = cache.get(userId)
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) {
    cache.delete(userId)
    return undefined
  }
  return entry.value
}

export function writeProfileCache(userId: string, value: CachedProfile): void {
  cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  // Cheap opportunistic eviction to keep the map bounded.
  if (cache.size > 500) {
    const now = Date.now()
    for (const [k, v] of cache) {
      if (v.expiresAt < now) cache.delete(k)
    }
  }
}

// Exposed for tests.
export function _clearProfileCache(): void {
  cache.clear()
}
