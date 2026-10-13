# Ecotecplast ColorHub

Private, admin-only industrial **color-matching** web app for a plastics
manufacturer. Lab technicians use it to register masterbatches with their
CIELAB calibration curves, run color matches against a target Lab value, and
track match jobs per client.

Given an inventory of masterbatches (pigment concentrates) and a target
color, the app computes the **mix of each masterbatch** (at which %) needed to
reach that color.

> The corporate marketing site was removed — this repo is the ColorHub app
> only. `/` redirects to `/login`.

## Stack

- **Framework:** [Astro](https://astro.build) v7 (`output: 'server'`)
- **Styling:** Tailwind CSS v3
- **Auth + DB:** Supabase (Postgres + Auth), RLS-enforced multi-tenancy
- **Match engine:** TypeScript port of a Python NumPy + SciPy SLSQP reference
- **Deploy:** Vercel (adapter), Supabase migrations via GitHub Actions
- **Tests:** Vitest

## Structure

```
src/
├── dashboard/            # Dashboard components + layout (SideRail, ui/*, matcher, calibration)
├── lib/
│   ├── match-engine/     # polyfit, minimize (Nelder-Mead), delta-e (CIE76 + CIEDE2000), matcher
│   └── supabase/         # server/browser/admin clients, JWT verify, profile cache
├── middleware.ts         # Verifies session, gates /dashboard/* to org admins
├── pages/
│   ├── index.astro       # Redirects to /login
│   ├── login.astro       # Admin login
│   ├── dashboard/        # color-matcher, simulator, calibration-lab, clients, references
│   └── api/              # color-match, masterbatches, providers, clients, jobs, color-references, auth
supabase/                 # config.toml, migrations/, seed*.sql
tests/match-engine/       # Unit tests (source of truth for the algorithm)
```

## Local development (Supabase Docker container)

The local database runs in Docker via the Supabase CLI (no Dockerfile needed).
Ports are offset to **563xx** in `supabase/config.toml` so this stack can run
alongside the other Supabase projects on the same machine.

```bash
brew install supabase/tap/supabase   # once
pnpm install

pnpm supabase:start                  # boots the Docker stack
pnpm supabase:reset                  # applies migrations + seed.sql
pnpm dev                             # http://localhost:4321/login
```

Local connection values (already written to the gitignored `.env.local`;
refresh from `pnpm supabase:status -o env` if you recreate the stack):

| Variable | Value |
|---|---|
| `PUBLIC_SUPABASE_URL` | `http://127.0.0.1:56321` |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` (static local demo key) |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` (static local demo key) |

Useful scripts: `pnpm supabase:status`, `pnpm supabase:stop`.
Studio: `http://127.0.0.1:56323`.

### Hosted projects (dev + prod)

Supabase branching is Pro-only, so dev and prod are **two separate free
projects**. `.env` points at hosted DEV; `.env.local` overrides it locally.

| Project | Purpose | Env target |
|---|---|---|
| `ecotecplast-colorhub-dev` | schema iteration, seed data | `.env` |
| `ecotecplast-colorhub-prod` | real inventory + history | Vercel env (Production) |

Both run the identical migrations in `supabase/migrations/`. Prod is seeded
with `supabase/seed_references.sql` (RAL reference library) only — real
providers/masterbatches/clients are added through the app UI.

Create an admin user, then promote them (per project):

```sql
-- add via Dashboard -> Authentication -> Users, then:
insert into organization_members (org_id, user_id, role)
select 1, id, 'admin' from auth.users where email = 'you@example.com'
on conflict do nothing;
```

## Environment variables

See `.env.example`. Never expose `SUPABASE_SECRET_KEY` to the browser.

| Variable | Scope |
|---|---|
| `PUBLIC_SUPABASE_URL` | public (build-time inlined) |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public (build-time inlined) |
| `SUPABASE_SECRET_KEY` | server-only (admin client) |

## Testing

```bash
pnpm test          # one-shot
pnpm test:watch    # re-run on change
pnpm build         # Astro + TypeScript check
```

`tests/match-engine/` is the source of truth for the algorithm: numerical
primitives (`polyfit2`, `deltaE2000` vs the Sharma-Wu-Dalal table), the recipe
matrix (single/two-pigment, boundaries, out-of-gamut), tolerance behavior,
invariants (determinism, 4 % budget) and a performance floor.

## Deploy (GitHub Actions)

`.github/workflows/deploy.yml` deploys **Supabase first, then Vercel**, scoped
by branch: `main` → the `production` GitHub environment, anything else → the
`development` environment. `vercel.json` disables Vercel's own Git auto-deploy
so the workflow is the only deployer.

Configure per environment (Settings → Environments):

- **Variables:** `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SUPABASE_PROJECT_REF`, `APP_URL`
- **Secrets:** `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`
  (Session pooler URI, IPv4), `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`

Pipeline: validate → resolve keys → `db push` (dev also seeds) → set Auth
redirect URLs → upsert Vercel env → create deployment and wait for `READY`.

## Match engine & domain constraints

- 2nd-degree polyfit per masterbatch/channel over 3 calibration points (0.5/1.0/2.0 %)
- Nelder-Mead with structured + random restarts; bounds `[0, 4]` per MB
- ΔE: CIE76 during search, CIEDE2000 for the pass/fail gate (`≤ 1.0`)
- Total pigment budget 4 % by mass; recipe rows `< 0.01 %` dropped
- Deterministic: same input → same recipe
- Carrier polymer filters eligible MBs (PE-carrier MBs don't disperse into PP)

See [AGENTS.md](AGENTS.md) for the multi-tenant data model and scaling notes.
