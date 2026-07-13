-- Demo scenario: "we saw Traffic Red suggested as Adquirir, went and bought
-- a Traffic Red masterbatch, now let's re-run the match."
--
-- This adds an MB whose 2% calibration chip lands exactly at RAL 3020
-- Traffic Red (43, 60, 44), so the failure→acquire→re-match loop can be
-- verified end-to-end against the DEV seed.
--
-- Idempotent — safe to re-run. To undo:
--   delete from masterbatches where supplier_sku = 'MB-Traffic-Red-320' and organization_id = 1;
--
-- BEFORE INSERT triggers on masterbatches require an auth.uid() to
-- auto-set organization_id. When running as service_role in the SQL
-- editor, disable triggers for this session so the explicit value below
-- takes effect.
set session_replication_role = replica;

insert into masterbatches (
  organization_id,
  provider_id,
  product_name,
  supplier_sku,
  color_index_num,
  base_carrier_polymer,
  current_stock_kg,
  internal_notes
)
select
  1,
  id,
  'Traffic Red Prime',
  'MB-Traffic-Red-320',
  'P.R. 254',
  'pe',
  50.0,
  'Acquired after gamut analysis suggested we needed reds beyond MB-Red-215.'
from providers
where name = 'BASF' and organization_id = 1
on conflict (organization_id, supplier_sku) do nothing;

insert into calibration_data (masterbatch_id, letdown_percentage, lab_l, lab_a, lab_b)
select m.id, x.pct, x.l, x.a, x.b
from masterbatches m
cross join (values
  -- 0.5% → moderate red with mild darkening (typical undertone)
  (0.5::numeric, 78.0::numeric, 20.0::numeric, 15.0::numeric),
  -- 1.0% → saturated red-orange, deeper
  (1.0::numeric, 62.0::numeric, 38.0::numeric, 27.0::numeric),
  -- 2.0% → EXACTLY RAL 3020 Traffic Red (43, 60, 44)
  (2.0::numeric, 43.0::numeric, 60.0::numeric, 44.0::numeric)
) as x(pct, l, a, b)
where m.supplier_sku = 'MB-Traffic-Red-320' and m.organization_id = 1
on conflict (masterbatch_id, letdown_percentage) do nothing;

set session_replication_role = origin;
