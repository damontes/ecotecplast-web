-- Production reference-color library.
-- Safe to paste into any project's SQL Editor. Idempotent
-- (`on conflict do nothing`), so re-running against an already-seeded DB
-- is a no-op.
--
-- Contents: RAL Classic — a curated ~35-color subset of the RAL Classic
-- industrial standard. RAL is:
--   * The de-facto color reference for European plastics manufacturing
--   * Openly published (no licensing restrictions like Pantone)
--   * Recognized by name/code across the supply chain — when a suggestion
--     says "RAL 3001 Signal Red", every plastics customer knows exactly
--     what that means.
--
-- The rest of the app (providers, masterbatches, calibrations, clients)
-- is populated by admins through the UI so real data never mixes with
-- demo/fixture data.
--
-- ACCURACY DISCLAIMER
-- -------------------
-- RAL is defined by physical printed reference chips. Any published Lab
-- value is an approximation for D65/10° observer measured against one
-- specific substrate + gloss level. The values below are compiled from
-- public references and suitable as a matching *hint*, not a QC-authoritative
-- source. For QC-critical work, measure the actual RAL chip on your
-- spectrophotometer and update the corresponding row via the
-- /dashboard/references UI.

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

-- --------------------------------------------------------------
-- Admin bootstrap (do once per project):
--   Supabase Dashboard → Authentication → Users → Add user (email + pass).
--   The `handle_new_user()` trigger creates the profile, finds-or-creates
--   the Ecotecplast org, and adds the user as admin — no follow-up SQL
--   needed.
-- --------------------------------------------------------------

-- Adding more palettes later (Pantone chips the customer measured,
-- their in-house color book, NCS, etc.) is either another SQL file
-- with distinct `palette` values, or one-by-one entry via the
-- /dashboard/references UI. The `on conflict (palette, code)` unique
-- constraint prevents duplicates across re-runs.
