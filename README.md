# Ecotecplast

Sitio web corporativo de Ecotecplast, empresa especializada en aditivos para la industria del plástico con más de 20 años de experiencia.

## Stack

- **Framework:** [Astro](https://astro.build) v3
- **Estilos:** [Tailwind CSS](https://tailwindcss.com) v3
- **Contenido:** MDX con colecciones de contenido
- **Correo:** [Resend](https://resend.com)
- **Despliegue:** [Vercel](https://vercel.com) (serverless)
- **Fuentes:** Montserrat Variable via Fontsource

## Estructura

```
src/
├── components/     # Componentes reutilizables
├── content/        # Colecciones MDX (productos y procesos)
├── images/         # Imágenes optimizadas con astro:assets
├── layouts/        # Layouts de página
├── lib/            # Utilidades (Resend, etc.)
├── pages/          # Rutas del sitio
│   ├── index.astro
│   ├── aditivos.astro
│   ├── contacto.astro
│   ├── e-purge.astro
│   ├── full-master-color.astro
│   └── aviso-de-privacidad.astro
└── const.ts        # Constantes del proyecto
```

## Comandos

| Comando | Acción |
|---------|--------|
| `pnpm dev` | Inicia servidor local en `localhost:4321` |
| `pnpm build` | Compila el sitio para producción |
| `pnpm preview` | Previsualiza la build localmente |

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `RESEND_API_KEY` | API key de Resend para envío de correos |
| `PUBLIC_SUPABASE_URL` | URL del proyecto Supabase (ColorHub dashboard) |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publishable de Supabase (`sb_publishable_...`) — segura para el navegador |
| `SUPABASE_SECRET_KEY` | Clave secret de Supabase (`sb_secret_...`) — solo servidor, nunca al cliente |

---

## ColorHub Dashboard (Supabase)

The `/dashboard/*` section is a private, admin-only app for industrial color matching. It uses Supabase for storage + auth and a TypeScript port of the match engine at `src/lib/match-engine/`.

### Two-project workflow (dev + prod)

Supabase branching is a Pro-tier feature. On free tier we get the same isolation by running **two separate free projects**:

| Project | Purpose | Env target |
|---|---|---|
| `ecotecplast-colorhub-dev` | schema iteration, seed data, throwaway users | local `.env` |
| `ecotecplast-colorhub-prod` | real inventory, real match history | Vercel environment variables |

Both use the identical migrations from `supabase/migrations/`. You only touch prod after a change has been proven on dev.

### One-time setup

1. **Install the Supabase CLI:**
   ```bash
   brew install supabase/tap/supabase
   supabase login
   ```

2. **Create two projects** in the Supabase Dashboard: `ecotecplast-colorhub-dev` and `ecotecplast-colorhub-prod` (both free tier).

3. **Bootstrap the DEV project** — this is where you'll actually work:
   ```bash
   supabase link --project-ref <DEV-project-ref>
   supabase db push
   ```
   Then paste `supabase/seed.sql` in the DEV project's SQL Editor. This
   is the **full demo seed**: fake providers, sample masterbatches with
   clean calibration curves, sample clients, and the reference-color library.

4. **Bootstrap the PROD project** — do this once, then avoid it:
   ```bash
   supabase link --project-ref <PROD-project-ref>
   supabase db push
   ```
   Then paste `supabase/seed_references.sql` — **NOT** `seed.sql` — in
   the PROD SQL Editor. That file loads a curated ~35 RAL Classic colors
   as the reference library. Real providers, masterbatches, and clients
   are added by admins through the app UI so the DB never mixes demo
   data with production data.

   **Pantone is not bundled** because their color values are licensed —
   customers who need Pantone matching should measure their own chips
   and add them via the *Colores de Referencia* UI under a custom
   palette name (`Pantone-Cliente-XYZ`, etc.).

5. **Point your `.env.local` at DEV** (values from DEV project → Settings → Data API):
   ```
   PUBLIC_SUPABASE_URL=https://<DEV-ref>.supabase.co
   PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SECRET_KEY=sb_secret_...
   ```

6. **Set PROD credentials on Vercel** (Project → Settings → Environment Variables, scope = *Production*):
   Same three variables, but with the PROD project's values.

7. **Create an admin user** in each project (Dashboard → Authentication → Users → Add user), then promote them:
   ```sql
   update public.profiles set is_admin = true where email = 'you@example.com';
   ```

### Daily development

```bash
pnpm dev
```
Visit **http://localhost:4321/login**. You're talking to DEV — safe to break, safe to reseed, safe to `truncate` tables.

### Shipping a schema change

```bash
# 1. Iterate against DEV using Supabase Studio SQL editor or execute_sql via MCP.
# 2. When happy, generate a migration file:
supabase db diff -f my_change_name --schema public
# 3. Commit the SQL file. Verify DEV is still clean:
supabase link --project-ref <DEV-ref>
supabase db push
# 4. Promote to PROD:
supabase link --project-ref <PROD-ref>
supabase db push
```

`supabase db push` **only runs new migrations** — it never runs `seed.sql`, and the migrations themselves are additive (no `drop`s unless you write one). Existing prod data is safe.

Rule of thumb: **the CLI is linked to whichever project you `supabase link`d last.** Check with `cat supabase/.temp/project-ref` before running any command that writes.

### Testing the match engine

Automated unit tests live in [tests/match-engine/](tests/match-engine/) and are the **source of truth** for the algorithm's expected behavior. Run them with:

```bash
pnpm test          # one-shot
pnpm test:watch    # re-run on file change
```

They cover:
- Numerical primitives (`polyfit2`, `polyval2`, `deltaE76`, `deltaE2000` against Sharma-Wu-Dalal reference table)
- The full recipe matrix (single-pigment, two-pigment, boundary cases, out-of-gamut)
- Tolerance parameter behavior (strict / standard / commercial)
- Invariants (determinism, 4% budget, no negatives)
- Performance floor (20 runs on 5 MBs < 5 s)

Manual smoke test in the UI (matches Group A1 from the tests):
- Baseline `L=95, a=0, b=0`, Target `L=75, a=12, b=-18`, tolerance **Strict** → PASS with 1.0% Blue + 0.5% Red
- Baseline `L=95, a=0, b=0`, Target `L=30, a=55, b=60`, tolerance **Strict** → FAIL, reachable substitutes suggested from the reference library

Each match creates a row in `match_history` with an auto-generated `job_identifier` (`EP-YYYY-NNNN`). To review them: go to **/dashboard/clients**, click a client, and see all their jobs with date-range and status filters on the detail page.

### Access model

| Table | Anonymous | Org member | Org admin |
|---|---|---|---|
| `organizations` | ❌ | Read own orgs | — |
| `providers`, `masterbatches`, `clients` | ❌ | Read (org-scoped) | Read + Write |
| `calibration_data` | ❌ | Read (via masterbatch org) | Read + Write |
| `match_history` | ❌ | Read (org-scoped), insert own | Read + Write |
| `color_references` | ❌ | Read (global) | Read + Write |
| `profiles` | ❌ | Read own | Read + update all |

RLS is enforced at the database level; the `service_role` bypasses RLS and is only used server-side.

### Ongoing schema changes

```bash
# 1. Iterate freely against your dev DB (or Supabase Studio SQL editor).
# 2. When happy, generate a new migration:
supabase db diff -f my_change_name --schema public
# 3. Review the SQL, commit, and:
supabase db push
```

---

## Multi-tenancy (Organizations)

Each organization (tenant) manages its own clients, providers, inventory, calibration data, and match history in isolation. `color_references` stays global — shared across all orgs.

**On deploy:** A default org (`Ecotecplast`) is created and all existing data is backfilled to it.

**On signup:** The `handle_new_user()` trigger creates a personal org for each new user and adds them as admin. The first step of onboarding will be naming the org.

**RLS:** Policies filter by `is_org_member(organization_id)` / `is_org_admin(organization_id)`. The server-side `service_role` bypasses RLS.
