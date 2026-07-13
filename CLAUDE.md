# Ecotecplast ColorHub — Project Context

## What this app is

The public site under `/` is the corporate marketing site (unchanged legacy).

The `/dashboard/*` section is a **private, admin-only industrial color-matching web app** for a plastics manufacturer. Lab technicians use it to:

1. Register masterbatches (pigment concentrates) with their 3-point CIELAB calibration curves — **Calibration Lab**
2. Run color-matching against a target Lab to get a mixing recipe (which MBs at which %) — **Color Matcher**
3. Track match jobs per client with date-range filtering — **Clients** → client detail

Access is gated by Supabase Auth + `profiles.is_admin` (not `user_metadata` — that's user-editable and unsafe).

## Match engine ([src/lib/match-engine/](src/lib/match-engine/))

TypeScript port of a Python NumPy + SciPy SLSQP reference:

- **2nd-degree polyfit** per MB, per Lab channel, over 3 calibration points (0.5 / 1.0 / 2.0 %)
- **Nelder-Mead** with structured + random restarts (zero-vector, uniform split, one-hot per MB, two-hot per pair). Bounds `[0, 4]` per MB; sum ≤ 4 via soft penalty
- **ΔE**: CIE76 during search (fast), CIEDE2000 for the pass/fail gate
- **Deterministic**: RNG seeded from (target, base, inventory IDs) — same input → same recipe

## Domain constraints

- **Total pigment budget**: 4.0 % by mass. Recipe rows < 0.01 % are dropped as noise
- **Pass gate**: ΔE2000 ≤ 1.0. Above → out-of-gamut, palette suggestions returned
- **Carrier polymer** filters which MBs are eligible (PE-carrier MBs don't disperse into PP)

## Data model (Supabase)

Tables: `organizations`, `organization_members`, `providers`, `masterbatches`, `calibration_data`, `clients`, `color_references`, `match_history`, `profiles`.

**Multi-tenant scoping** — introduced by migration `20260710000005_organizations.sql`.

- **`organization_id`** NOT NULL FK on `providers`, `masterbatches`, `clients`, `match_history`. `calibration_data` is scoped *through* its parent masterbatch (no direct FK; RLS uses an EXISTS-join). `color_references` is intentionally **global** — RAL and other palettes are shared industry vocabulary. `profiles` is per-user, not per-org.
- **`organization_members(org_id, user_id, role)`** — many-to-many table with `role in ('admin', 'member')`. This is the **only** source of "who's admin of what". `profiles` has no `is_admin` column — there is no dual bookkeeping.
- Unique constraints on `providers.name`, `clients.name`, `masterbatches.supplier_sku` are per-org (same "Clariant" can exist across many customers).

**RLS helpers** (SECURITY DEFINER):
- `is_org_member(int)` — true if `auth.uid()` has a row in `organization_members` for the given org
- `is_org_admin(int)` — same, restricted to `role='admin'`

**RLS pattern per scoped table**:
- SELECT: `is_org_member(organization_id)` (plus `created_by = auth.uid()` on `match_history` so a user always sees their own runs)
- Write (INSERT/UPDATE/DELETE): `is_org_admin(organization_id)` in `USING` + `WITH CHECK` so admins can't re-parent rows

**BEFORE INSERT triggers** on `providers`, `masterbatches`, `clients`, `match_history`: `set_org_from_user()` looks up the user's org via `organization_members` and stamps `new.organization_id`. The frontend/API doesn't strictly need to send it — but we do include it explicitly for defense-in-depth (trigger overwrites either way).

**`handle_new_user()` trigger**: creates the "Ecotecplast" org if missing, adds the new user to `organization_members` as `admin`, and creates a `profiles` row.

**API pattern**:
- Reads: RLS handles scoping, no explicit filter.
- Inserts on scoped tables: the trigger auto-sets `organization_id` from the caller's `auth.uid()`. We also send it explicitly (`organization_id: locals.user.organizationId`) as a belt-and-suspenders safeguard.
- Inserts on `calibration_data`: no `organization_id` field exists; RLS scopes it via the parent masterbatch.
- Updates/deletes: RLS scoped, no explicit filter.

**Middleware** ([src/middleware.ts](src/middleware.ts)) reads `organization_members.role + org_id` (ordered by created_at, first membership) and exposes it as `locals.user = { id, email, isAdmin, organizationId }`. Cached 30 s per user in [admin-cache.ts](src/lib/supabase/admin-cache.ts).

**Seed** ([supabase/seed.sql](supabase/seed.sql), [supabase/scenarios/*.sql](supabase/scenarios/)): wraps the INSERT block in `set session_replication_role = replica` so the org-set triggers don't reject the service-role context. `set session_replication_role = origin` at the end. Explicit `organization_id = 1` on every row.

## Environments

Two **free-tier Supabase projects** (dev + prod) — branching is Pro-only. Same migrations pushed to both. Local `.env` points at DEV, Vercel envs point at PROD.

Env var naming uses the new Supabase API keys:
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`)
- `SUPABASE_SECRET_KEY` (`sb_secret_...`)

Never expose the secret key. It's read only in [src/lib/supabase/admin.ts](src/lib/supabase/admin.ts) (server-only).

## Scaling — when to change what

Current implementation is fine up to ~100 MBs per polymer. Rough table:

| Per-polymer inventory | Match time | Action |
|---|---|---|
| ≤ 20 MBs | 10–50 ms | none |
| 20–50 MBs | 50–200 ms | none |
| 50–100 MBs | 200–500 ms | still fine |
| 100–300 MBs | 0.5–3 s | add pre-filter step |
| 300+ MBs | > 3 s | batched pre-filter + smaller candidate set |

Trigger to optimize: real user complains about matcher latency, **or** per-polymer inventory crosses ~80. Whichever first.

## Prediction / ML roadmap

The physics-based matcher is correct and explainable; ML is not a replacement. Progression:

1. **k-NN over `match_history`** — "someone already matched this Lab; reuse their recipe as the optimizer's starting seed." Zero training. Worth doing once history has ~100 jobs
2. **Heuristic MB pre-filter** — rank MBs by "ΔE-per-% shift toward target"; keep top ~30 before optimizing. No ML
3. **Learned pre-filter** — small model (logistic regression / MLP) on `match_history` predicting "will MB X appear in recipe?" — worth it around 500+ jobs
4. **Recipe regression** — direct target → concentrations. Only pays off with thousands of jobs

Don't invert this order.

## Testing

Test matrix (real-recipe-verified for the current seed) lives in the "Test Matrix" section of [README.md](README.md#test-matrix). Six groups: single-pigment PASS, multi-pigment PASS, boundaries, out-of-gamut with suggestions, out-of-gamut without suggestions, non-white baseline.
