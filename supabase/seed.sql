-- ==============================================================
-- DEV / STAGING SEED — DO NOT RUN AGAINST PRODUCTION
-- ==============================================================
--
-- This file seeds fictional demo data used to exercise every path of
-- the app: fake providers, sample masterbatches with clean calibration
-- curves, sample clients, and a full reference-color library.
--
-- If you want to seed a PROD project, use `supabase/seed_references.sql`
-- instead — it contains only the reference-color library (safe to keep
-- alongside real inventory) and skips the fake providers, masterbatches,
-- and clients.
--
-- Statements are idempotent (`on conflict do nothing`) so re-runs against
-- an already-seeded DEV DB are safe. `supabase db push` never triggers
-- this file — it only runs when explicitly executed (SQL editor,
-- `supabase db reset` on Docker, or `psql`).
--
-- Calibration curves below are back-calibrated from the real production
-- recipe of ETP-VEMP-32D (3.6% PV7 + 11.4% PA14 → measured chip Lab
-- (51.9, -37.3, 29.4)). τ_verde = 3.1, τ_amarillo = 36 fit that anchor.
-- Values computed at 2/8/15% pigment loading in matrix cera+CaCO3, base
-- assumed (100, 0, 0). Marked as 'estimated' because they come from a
-- model, not from measured chips at each concentration.
--
-- Target for validation: (51.9, -37.3, 29.4). Matcher should return
-- closest_recipe with ratio ~24% verde / 76% amarillo (mirroring the
-- known-good recipe). ΔE final around 15-20 — L residual is a known
-- limitation of the single-tau exponential model.

-- Ensure the default "Ecotecplast" org exists. Normally created lazily
-- by handle_new_user() on the first signup — but if you're seeding
-- before signing anyone in, we create it now so the org_id=1 references
-- below resolve.
insert into organizations (id, name, slug) values (1, 'Ecotecplast', 'ecotecplast')
on conflict (slug) do nothing;
select setval('organizations_id_seq', greatest((select max(id) from organizations), 1));

-- IMPORTANT: the initial-schema migration installs BEFORE INSERT triggers
-- on providers/masterbatches/clients/match_history that overwrite
-- organization_id from auth.uid()→organization_members. When running as
-- service_role (SQL editor, psql), auth.uid() is null and those triggers
-- raise "User is not a member of any organization". Bypass them for this
-- session so the explicit organization_id values below take effect.
--
-- This is safe: the seed runs once per DEV DB reset and never in prod.
set session_replication_role = replica;

insert into providers (organization_id, name) values
  (1, 'Sincol'),
  (1, 'Clariant'),
  (1, 'BASF'),
  (1, 'Ampacet'),
  (1, 'Other')
on conflict (organization_id, name) do nothing;

-- Clean out prior seed masterbatches so re-runs stay consistent.
-- Cascades to their calibration_data rows.
delete from masterbatches where supplier_sku in (
  'PV7-SINCOL', 'PA14-SINCOL',
  'PR254-DEMO', 'PB15-DEMO', 'PBk7-DEMO'
) and organization_id = 1;

-- --- Pigmento Verde 7 (Sincol) — phthalocyanine green ---
-- Back-calibrated with τ = 3.1, base (100, 0, 0):
-- 2%  → (81.74, -33.21,  4.92)
-- 8%  → (64.51, -64.55,  9.55)
-- 15% → (61.86, -69.36, 10.27)
insert into masterbatches (organization_id, provider_id, product_name, supplier_sku, color_index_num, base_carrier_polymer, current_stock_kg, internal_notes, calibration_source)
select 1, id, 'Pigmento Verde 7', 'PV7-SINCOL', 'P.V. 7', 'wax', 10.0, 'Seed: back-calibrated from ETP-VEMP-32D recipe (τ=3.1)', 'estimated'
from providers where name = 'Sincol' and organization_id = 1;

insert into calibration_data (masterbatch_id, letdown_percentage, lab_l, lab_a, lab_b)
select m.id, x.pct, x.l, x.a, x.b
from masterbatches m
cross join (values
  (2.0::numeric,  81.74::numeric, -33.21::numeric,  4.92::numeric),
  (8.0::numeric,  64.51::numeric, -64.55::numeric,  9.55::numeric),
  (15.0::numeric, 61.86::numeric, -69.36::numeric, 10.27::numeric)
) as x(pct, l, a, b)
where m.supplier_sku = 'PV7-SINCOL' and m.organization_id = 1;

-- --- Pigmento Amarillo 14 (Sincol) — diarylide yellow ---
-- Back-calibrated with τ = 36, base (100, 0, 0):
-- 2%  → (99.12,  0.36,  5.15)
-- 8%  → (96.78,  1.32, 18.92)
-- 15% → (94.48,  2.25, 32.44)
insert into masterbatches (organization_id, provider_id, product_name, supplier_sku, color_index_num, base_carrier_polymer, current_stock_kg, internal_notes, calibration_source)
select 1, id, 'Pigmento Amarillo 14', 'PA14-SINCOL', 'P.Y. 14', 'wax', 10.0, 'Seed: back-calibrated from ETP-VEMP-32D recipe (τ=36)', 'estimated'
from providers where name = 'Sincol' and organization_id = 1;

insert into calibration_data (masterbatch_id, letdown_percentage, lab_l, lab_a, lab_b)
select m.id, x.pct, x.l, x.a, x.b
from masterbatches m
cross join (values
  (2.0::numeric,  99.12::numeric, 0.36::numeric,  5.15::numeric),
  (8.0::numeric,  96.78::numeric, 1.32::numeric, 18.92::numeric),
  (15.0::numeric, 94.48::numeric, 2.25::numeric, 32.44::numeric)
) as x(pct, l, a, b)
where m.supplier_sku = 'PA14-SINCOL' and m.organization_id = 1;

-- --- Rojo P.R. 254 (demo) — quinacridone / DPP red ---
-- Estimated with masstone (30, 55, 40), τ = 3, base (100, 0, 0).
-- Anchor color close to RAL 3001 / RAL 3020 at chip loading.
insert into masterbatches (organization_id, provider_id, product_name, supplier_sku, color_index_num, base_carrier_polymer, current_stock_kg, internal_notes, calibration_source)
select 1, id, 'Rojo Demo (P.R. 254)', 'PR254-DEMO', 'P.R. 254', 'wax', 10.0, 'Seed: curva estimada (τ=3) desde masstone (30, 55, 40)', 'estimated'
from providers where name = 'Sincol' and organization_id = 1;

insert into calibration_data (masterbatch_id, letdown_percentage, lab_l, lab_a, lab_b)
select m.id, x.pct, x.l, x.a, x.b
from masterbatches m
cross join (values
  (2.0::numeric,  65.91::numeric, 26.79::numeric, 19.48::numeric),
  (8.0::numeric,  34.83::numeric, 51.21::numeric, 37.24::numeric),
  (15.0::numeric, 30.49::numeric, 54.62::numeric, 39.72::numeric)
) as x(pct, l, a, b)
where m.supplier_sku = 'PR254-DEMO' and m.organization_id = 1;

-- --- Azul P.B. 15:3 (demo) — phthalocyanine blue ---
-- Estimated with masstone (25, 5, -50), τ = 2.5, base (100, 0, 0).
-- Anchor color close to RAL 5002 / RAL 5017 at chip loading.
insert into masterbatches (organization_id, provider_id, product_name, supplier_sku, color_index_num, base_carrier_polymer, current_stock_kg, internal_notes, calibration_source)
select 1, id, 'Azul Demo (P.B. 15:3)', 'PB15-DEMO', 'P.B. 15:3', 'wax', 10.0, 'Seed: curva estimada (τ=2.5) desde masstone (25, 5, -50)', 'estimated'
from providers where name = 'Sincol' and organization_id = 1;

insert into calibration_data (masterbatch_id, letdown_percentage, lab_l, lab_a, lab_b)
select m.id, x.pct, x.l, x.a, x.b
from masterbatches m
cross join (values
  (2.0::numeric,  58.68::numeric,  2.75::numeric, -27.53::numeric),
  (8.0::numeric,  28.00::numeric,  4.80::numeric, -47.99::numeric),
  (15.0::numeric, 25.15::numeric,  4.99::numeric, -49.90::numeric)
) as x(pct, l, a, b)
where m.supplier_sku = 'PB15-DEMO' and m.organization_id = 1;

-- --- Negro P.Bk. 7 (demo) — carbon black ---
-- Estimated with masstone (14, 0, 0), τ = 2, base (100, 0, 0).
-- Very strong pigment — near-black at low loadings.
insert into masterbatches (organization_id, provider_id, product_name, supplier_sku, color_index_num, base_carrier_polymer, current_stock_kg, internal_notes, calibration_source)
select 1, id, 'Negro Demo (P.Bk. 7)', 'PBk7-DEMO', 'P.Bk. 7', 'wax', 10.0, 'Seed: curva estimada (τ=2) desde masstone (14, 0, 0)', 'estimated'
from providers where name = 'Sincol' and organization_id = 1;

insert into calibration_data (masterbatch_id, letdown_percentage, lab_l, lab_a, lab_b)
select m.id, x.pct, x.l, x.a, x.b
from masterbatches m
cross join (values
  (2.0::numeric,  45.65::numeric, 0::numeric, 0::numeric),
  (8.0::numeric,  15.55::numeric, 0::numeric, 0::numeric),
  (15.0::numeric, 14.00::numeric, 0::numeric, 0::numeric)
) as x(pct, l, a, b)
where m.supplier_sku = 'PBk7-DEMO' and m.organization_id = 1;

-- --- Clients (starter set) ---
insert into clients (organization_id, name, contact_email, default_carrier_polymer, notes) values
  (1, 'Automotive Plastics Corp', 'contact@apc.example', 'pp', 'PP interior trims, mostly'),
  (1, 'EnvaseTec S.A. de C.V.',   'ventas@envasetec.example', 'pe', 'HDPE bottles and caps'),
  (1, 'Textiles del Norte',       'compras@txnorte.example', 'pet', 'Fiber-grade PET'),
  (1, 'Muestra / Sample',         null, 'pe', 'Internal QC and sample runs')
on conflict (organization_id, name) do nothing;

-- --- Color reference library — RAL Classic ---
-- Curated subset of the RAL Classic industrial standard. RAL is the
-- de-facto color reference for European plastics manufacturing, openly
-- published, and recognized by name/code across the supply chain.
--
-- ACCURACY NOTE: Lab values are approximations for D65/10° observer on
-- one standardized substrate + gloss level. Suitable as a matching hint,
-- not as a QC-authoritative source. For QC-critical work, measure the
-- actual RAL chip on your spectrophotometer and update via /dashboard/references.

insert into color_references (palette, code, name, lab_l, lab_a, lab_b) values
  -- Yellows / Oranges
  ('RAL', 'RAL 1003', 'Signal Yellow',         76.0,  13.0,  79.0),
  ('RAL', 'RAL 1015', 'Light Ivory',           87.0,   3.0,  17.0),
  ('RAL', 'RAL 1018', 'Zinc Yellow',           82.0,   6.0,  76.0),
  ('RAL', 'RAL 1023', 'Traffic Yellow',        77.0,  12.0,  85.0),
  ('RAL', 'RAL 2000', 'Yellow Orange',         64.0,  41.0,  71.0),
  ('RAL', 'RAL 2004', 'Pure Orange',           54.0,  58.0,  61.0),
  ('RAL', 'RAL 2011', 'Deep Orange',           54.0,  55.0,  59.0),

  -- Reds
  ('RAL', 'RAL 3000', 'Flame Red',             39.0,  53.0,  32.0),
  ('RAL', 'RAL 3001', 'Signal Red',            37.0,  55.0,  32.0),
  ('RAL', 'RAL 3020', 'Traffic Red',           43.0,  60.0,  44.0),

  -- Violets
  ('RAL', 'RAL 4005', 'Blue Lilac',            44.0,  15.0, -24.0),
  ('RAL', 'RAL 4006', 'Traffic Purple',        39.0,  44.0,  -3.0),

  -- Blues
  ('RAL', 'RAL 5002', 'Ultramarine Blue',      25.0,  13.0, -48.0),
  ('RAL', 'RAL 5005', 'Signal Blue',           27.0,   1.0, -38.0),
  ('RAL', 'RAL 5010', 'Gentian Blue',          27.0,  -8.0, -32.0),
  ('RAL', 'RAL 5012', 'Light Blue',            53.0, -15.0, -30.0),
  ('RAL', 'RAL 5015', 'Sky Blue',              47.0, -15.0, -38.0),
  ('RAL', 'RAL 5017', 'Traffic Blue',          32.0,  -8.0, -42.0),

  -- Greens
  ('RAL', 'RAL 6000', 'Patina Green',          48.0, -22.0,   8.0),
  ('RAL', 'RAL 6002', 'Leaf Green',            44.0, -24.0,  25.0),
  ('RAL', 'RAL 6018', 'Yellow Green',          59.0, -32.0,  41.0),
  ('RAL', 'RAL 6029', 'Mint Green',            42.0, -42.0,  23.0),

  -- Greys
  ('RAL', 'RAL 7016', 'Anthracite Grey',       32.0,  -2.0,  -4.0),
  ('RAL', 'RAL 7035', 'Light Grey',            79.0,  -1.0,   1.0),
  ('RAL', 'RAL 7047', 'Telegrey 4',            76.0,  -1.0,   1.0),

  -- Browns
  ('RAL', 'RAL 8017', 'Chocolate Brown',       29.0,  15.0,   8.0),

  -- Whites / Blacks
  ('RAL', 'RAL 9001', 'Cream',                 91.0,   1.0,   8.0),
  ('RAL', 'RAL 9003', 'Signal White',          95.0,  -1.0,   1.0),
  ('RAL', 'RAL 9004', 'Signal Black',          25.0,   0.0,   0.0),
  ('RAL', 'RAL 9005', 'Jet Black',             14.0,   0.0,   0.0),
  ('RAL', 'RAL 9010', 'Pure White',            94.0,  -1.0,   1.0),
  ('RAL', 'RAL 9016', 'Traffic White',         95.0,  -1.0,   1.0),
  ('RAL', 'RAL 9017', 'Traffic Black',         15.0,   0.0,   0.0)
on conflict (palette, code) do nothing;

-- Restore trigger firing for future sessions.
set session_replication_role = origin;

-- --------------------------------------------------------------
-- Admin bootstrap (do once per project):
--   Supabase Dashboard → Authentication → Users → Add user (email + pass).
--   The `handle_new_user()` trigger:
--     * creates the profile
--     * finds-or-creates the Ecotecplast org
--     * adds the user to organization_members as 'admin'
--
-- Admin status lives ONLY in organization_members.role. There is no
-- separate profiles.is_admin flag.
-- --------------------------------------------------------------

-- See README (ColorHub Dashboard → Test Matrix) for the full list of
-- test cases with expected recipes.
