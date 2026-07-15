-- Optional demo palette — expand the inventory with 3 additional primary
-- pigments (rojo, azul, negro) so the operator has more variety to
-- experiment with in the Simulador de Mezcla.
--
-- Safe to paste into any project's SQL Editor. Idempotent — re-running
-- against an already-seeded DB is a no-op thanks to the ON CONFLICT clauses.
--
-- These are approximations for a "starter palette" — masstones estimated
-- from common industrial-pigment datasheets, calibration curves at
-- 2 / 8 / 15% computed via the same exponential model the app uses in
-- the "Estimar 2% y 15%" flow:
--
--   Lab(c) = base + (masstone − base) × (1 − e^(−c/τ))
--
-- Base assumed white (100, 0, 0). Marked as `calibration_source = 'estimated'`
-- so the UI shows the "Est." badge and the operator knows to validate
-- in planta before production runs.
--
-- To undo:
--   delete from masterbatches
--    where supplier_sku in ('PR254-DEMO', 'PB15-DEMO', 'PBk7-DEMO')
--      and organization_id = 1;

-- IMPORTANT: the initial-schema migration installs BEFORE INSERT triggers
-- on providers/masterbatches that overwrite organization_id from
-- auth.uid()→organization_members. When running as service_role (SQL editor,
-- psql), auth.uid() is null and those triggers raise "User is not a member".
-- Bypass them for this session.
set session_replication_role = replica;

-- Ensure the 'Sincol' provider exists (same one used by PV7/PA14).
insert into providers (organization_id, name) values (1, 'Sincol')
on conflict (organization_id, name) do nothing;

-- ────────────────────────────────────────────────────────────────────
-- Rojo P.R. 254 — DPP / quinacridone red
-- Masstone (30, 55, 40), τ = 3
-- Anchor color close to RAL 3001 / RAL 3020 at chip loading.
-- ────────────────────────────────────────────────────────────────────
insert into masterbatches (
  organization_id, provider_id, product_name, supplier_sku,
  color_index_num, base_carrier_polymer, current_stock_kg,
  internal_notes, calibration_source
)
select
  1, id, 'Rojo Demo (P.R. 254)', 'PR254-DEMO',
  'P.R. 254', 'wax', 10.0,
  'Seed palette: curva estimada (τ=3) desde masstone (30, 55, 40)',
  'estimated'
from providers where name = 'Sincol' and organization_id = 1
on conflict (organization_id, supplier_sku) do nothing;

insert into calibration_data (masterbatch_id, letdown_percentage, lab_l, lab_a, lab_b)
select m.id, x.pct, x.l, x.a, x.b
from masterbatches m
cross join (values
  (2.0::numeric,  65.91::numeric, 26.79::numeric, 19.48::numeric),
  (8.0::numeric,  34.83::numeric, 51.21::numeric, 37.24::numeric),
  (15.0::numeric, 30.49::numeric, 54.62::numeric, 39.72::numeric)
) as x(pct, l, a, b)
where m.supplier_sku = 'PR254-DEMO' and m.organization_id = 1
on conflict (masterbatch_id, letdown_percentage) do nothing;

-- ────────────────────────────────────────────────────────────────────
-- Azul P.B. 15:3 — phthalocyanine blue
-- Masstone (25, 5, -50), τ = 2.5
-- Anchor color close to RAL 5002 / RAL 5017 at chip loading.
-- ────────────────────────────────────────────────────────────────────
insert into masterbatches (
  organization_id, provider_id, product_name, supplier_sku,
  color_index_num, base_carrier_polymer, current_stock_kg,
  internal_notes, calibration_source
)
select
  1, id, 'Azul Demo (P.B. 15:3)', 'PB15-DEMO',
  'P.B. 15:3', 'wax', 10.0,
  'Seed palette: curva estimada (τ=2.5) desde masstone (25, 5, -50)',
  'estimated'
from providers where name = 'Sincol' and organization_id = 1
on conflict (organization_id, supplier_sku) do nothing;

insert into calibration_data (masterbatch_id, letdown_percentage, lab_l, lab_a, lab_b)
select m.id, x.pct, x.l, x.a, x.b
from masterbatches m
cross join (values
  (2.0::numeric,  58.68::numeric,  2.75::numeric, -27.53::numeric),
  (8.0::numeric,  28.00::numeric,  4.80::numeric, -47.99::numeric),
  (15.0::numeric, 25.15::numeric,  4.99::numeric, -49.90::numeric)
) as x(pct, l, a, b)
where m.supplier_sku = 'PB15-DEMO' and m.organization_id = 1
on conflict (masterbatch_id, letdown_percentage) do nothing;

-- ────────────────────────────────────────────────────────────────────
-- Negro P.Bk. 7 — carbon black
-- Masstone (14, 0, 0), τ = 2 (very strong — near-black at low loadings).
-- ────────────────────────────────────────────────────────────────────
insert into masterbatches (
  organization_id, provider_id, product_name, supplier_sku,
  color_index_num, base_carrier_polymer, current_stock_kg,
  internal_notes, calibration_source
)
select
  1, id, 'Negro Demo (P.Bk. 7)', 'PBk7-DEMO',
  'P.Bk. 7', 'wax', 10.0,
  'Seed palette: curva estimada (τ=2) desde masstone (14, 0, 0)',
  'estimated'
from providers where name = 'Sincol' and organization_id = 1
on conflict (organization_id, supplier_sku) do nothing;

insert into calibration_data (masterbatch_id, letdown_percentage, lab_l, lab_a, lab_b)
select m.id, x.pct, x.l, x.a, x.b
from masterbatches m
cross join (values
  (2.0::numeric,  45.65::numeric, 0::numeric, 0::numeric),
  (8.0::numeric,  15.55::numeric, 0::numeric, 0::numeric),
  (15.0::numeric, 14.00::numeric, 0::numeric, 0::numeric)
) as x(pct, l, a, b)
where m.supplier_sku = 'PBk7-DEMO' and m.organization_id = 1
on conflict (masterbatch_id, letdown_percentage) do nothing;

set session_replication_role = origin;
