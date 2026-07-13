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
-- Calibration curves below are hand-designed so that:
--   * Base resin (95, 0, 0) + 1.0% Blue + 0.5% Red → predicts EXACTLY Lab
--     (75, 12, -18). Use that as your PASS target (ΔE ≈ 0).
--   * Deep saturated orange (30, 55, 60) cannot be reached even at 2%+2%
--     mix — use that as your FAIL target (ΔE > 1.0, out-of-gamut).

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
  (1, 'Clariant'),
  (1, 'BASF'),
  (1, 'Ampacet'),
  (1, 'PolyOne'),
  (1, 'Other')
on conflict (organization_id, name) do nothing;

-- Clean out prior seed masterbatches so re-runs after a curve tweak stay
-- consistent. Cascades to their calibration_data rows.
delete from masterbatches where supplier_sku in ('MB-Blue-402', 'MB-Red-215', 'MB-Yellow-901') and organization_id = 1;

-- --- Phthalo Blue (Clariant) ---
-- 0.5% → (87, -2, -10)     shift (-8,  -2, -10)
-- 1.0% → (80, -3, -18)     shift (-15, -3, -18)  ← PASS-recipe anchor
-- 2.0% → (65, -6, -32)     shift (-30, -6, -32)
insert into masterbatches (organization_id, provider_id, product_name, supplier_sku, color_index_num, base_carrier_polymer, current_stock_kg, internal_notes)
select 1, id, 'Ultra Blue Prime', 'MB-Blue-402', 'P.B. 15:3', 'pe', 120.0, 'Seed: phthalo blue baseline'
from providers where name = 'Clariant' and organization_id = 1;

insert into calibration_data (masterbatch_id, letdown_percentage, lab_l, lab_a, lab_b)
select m.id, x.pct, x.l, x.a, x.b
from masterbatches m
cross join (values
  (0.5::numeric, 87.0::numeric, -2.0::numeric, -10.0::numeric),
  (1.0::numeric, 80.0::numeric, -3.0::numeric, -18.0::numeric),
  (2.0::numeric, 65.0::numeric, -6.0::numeric, -32.0::numeric)
) as x(pct, l, a, b)
where m.supplier_sku = 'MB-Blue-402' and m.organization_id = 1;

-- --- Signal Red (BASF) ---
-- 0.5% → (90, 15, 0)       shift (-5,  15, 0)   ← PASS-recipe anchor
-- 1.0% → (85, 28, 2)       shift (-10, 28, 2)
-- 2.0% → (75, 48, 5)       shift (-20, 48, 5)
insert into masterbatches (organization_id, provider_id, product_name, supplier_sku, color_index_num, base_carrier_polymer, current_stock_kg, internal_notes)
select 1, id, 'Signal Red Prime', 'MB-Red-215', 'P.R. 254', 'pe', 85.0, 'Seed: DPP red baseline'
from providers where name = 'BASF' and organization_id = 1;

insert into calibration_data (masterbatch_id, letdown_percentage, lab_l, lab_a, lab_b)
select m.id, x.pct, x.l, x.a, x.b
from masterbatches m
cross join (values
  (0.5::numeric, 90.0::numeric, 15.0::numeric, 0.0::numeric),
  (1.0::numeric, 85.0::numeric, 28.0::numeric, 2.0::numeric),
  (2.0::numeric, 75.0::numeric, 48.0::numeric, 5.0::numeric)
) as x(pct, l, a, b)
where m.supplier_sku = 'MB-Red-215' and m.organization_id = 1;

-- --- Solar Yellow (Ampacet) ---
-- 0.5% → (92, -1, 15)      shift (-3, -1, 15)
-- 1.0% → (89, -2, 28)      shift (-6, -2, 28)
-- 2.0% → (84, -3, 45)      shift (-11, -3, 45)
insert into masterbatches (organization_id, provider_id, product_name, supplier_sku, color_index_num, base_carrier_polymer, current_stock_kg, internal_notes)
select 1, id, 'Solar Yellow Prime', 'MB-Yellow-901', 'P.Y. 180', 'pe', 60.0, 'Seed: benzimidazolone yellow baseline'
from providers where name = 'Ampacet' and organization_id = 1;

insert into calibration_data (masterbatch_id, letdown_percentage, lab_l, lab_a, lab_b)
select m.id, x.pct, x.l, x.a, x.b
from masterbatches m
cross join (values
  (0.5::numeric, 92.0::numeric, -1.0::numeric, 15.0::numeric),
  (1.0::numeric, 89.0::numeric, -2.0::numeric, 28.0::numeric),
  (2.0::numeric, 84.0::numeric, -3.0::numeric, 45.0::numeric)
) as x(pct, l, a, b)
where m.supplier_sku = 'MB-Yellow-901' and m.organization_id = 1;

-- --- Clients (starter set) ---
insert into clients (organization_id, name, contact_email, default_carrier_polymer, notes) values
  (1, 'Automotive Plastics Corp', 'contact@apc.example', 'pp', 'PP interior trims, mostly'),
  (1, 'EnvaseTec S.A. de C.V.',   'ventas@envasetec.example', 'pe', 'HDPE bottles and caps'),
  (1, 'Textiles del Norte',       'compras@txnorte.example', 'pet', 'Fiber-grade PET'),
  (1, 'Muestra / Sample',         null, 'pe', 'Internal QC and sample runs')
on conflict (organization_id, name) do nothing;

-- --- Color reference library ---
-- Split into two groups so the palette-suggestions feature has both
-- reachable and out-of-gamut entries against the seed inventory:
--   * INT-* Reachable: hand-designed to sit inside the reachable gamut
--     of the 3 seed MBs at ≤4% total. Palette suggestions should recover
--     these when a target is out of gamut but nearby.
--   * INT-* Aspirational: deep saturations / neutrals / very dark colors
--     that require pigments we don't have. These simulate "colors on your
--     wall book you can't currently make" and will be skipped by the
--     suggester because no recipe exists.

insert into color_references (palette, code, name, lab_l, lab_a, lab_b) values
  -- Reachable with Blue + Red + Yellow at ≤4% total on Lab (95,0,0) base:
  ('Internal', 'INT-BLU-004',     'Powder Blue',      87.0,  -2.0, -10.0),
  ('Internal', 'INT-BLU-005',     'Cadet Blue',       80.0,  -3.0, -18.0),
  ('Internal', 'INT-BLU-006',     'Deep Blue',        65.0,  -6.0, -32.0),
  ('Internal', 'INT-RED-003',     'Coral',            90.0,  15.0,   0.0),
  ('Internal', 'INT-RED-004',     'Poppy Red',        85.0,  28.0,   2.0),
  ('Internal', 'INT-RED-005',     'Deep Poppy',       75.0,  48.0,   5.0),
  ('Internal', 'INT-YEL-003',     'Light Cream',      92.0,  -1.0,  15.0),
  ('Internal', 'INT-YEL-004',     'Butter Yellow',    89.0,  -2.0,  28.0),
  ('Internal', 'INT-YEL-005',     'Solar Yellow',     84.0,  -3.0,  45.0),
  ('Internal', 'INT-VIO-002',     'Berry Purple',     70.0,  25.0, -16.0),
  ('Internal', 'INT-PNK-002',     'Rose Blush',       76.0,  26.0,  -6.0),
  ('Internal', 'INT-GRN-003',     'Sage Green',       84.0,  -3.0,   5.0),
  ('Internal', 'INT-ORG-002',     'Peach',            84.0,  13.0,  28.0),
  ('Internal', 'INT-ORG-003',     'Terracotta',       82.0,  27.0,  17.0),

  -- Aspirational (out-of-gamut with the seed inventory — used to test the
  -- "no reachable references" branch):
  ('Internal', 'INT-RED-001',     'Signal Red',       48.0,  55.0,  32.0),
  ('Internal', 'INT-ORG-001',     'Pure Orange',      60.0,  45.0,  60.0),
  ('Internal', 'INT-YEL-001',     'Sulfur Yellow',    82.0,  -5.0,  85.0),
  ('Internal', 'INT-GRN-001',     'Grass Green',      52.0, -32.0,  30.0),
  ('Internal', 'INT-GRN-002',     'Mint Green',       78.0, -30.0,   5.0),
  ('Internal', 'INT-BLU-002',     'Signal Blue',      35.0,   0.0, -38.0),
  ('Internal', 'INT-BLU-003',     'Ultramarine',      28.0,  15.0, -50.0),
  ('Internal', 'INT-VIO-001',     'Deep Violet',      40.0,  35.0, -30.0),
  ('Internal', 'INT-BRN-001',     'Chocolate Brown',  32.0,  18.0,  20.0),
  ('Internal', 'INT-GRY-002',     'Iron Grey',        45.0,  -2.0,   1.0),
  ('Internal', 'INT-BLK-001',     'Jet Black',        16.0,   0.0,   0.0),
  ('Internal', 'INT-WHT-001',     'Titanium White',   95.0,   0.0,   2.0)
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
