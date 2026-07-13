// Shared fixtures for the matcher tests.
// Values MUST stay in sync with supabase/seed.sql — if the seed changes,
// these fixtures change too, and vice versa. Regression tests then guard
// against silent divergence between the two.

import type { Lab, MasterbatchInput } from '@/lib/match-engine/matcher'

export const BASE_RESIN_LAB: Lab = [95, 0, 0]

export const seedBlue: MasterbatchInput = {
  id: 1,
  sku: 'MB-Blue-402',
  productName: 'Ultra Blue Prime',
  provider: 'Clariant',
  baseCarrierPolymer: 'pe',
  calibration: [
    { letdownPercentage: 0.5, lab: [87, -2, -10] },
    { letdownPercentage: 1.0, lab: [80, -3, -18] },
    { letdownPercentage: 2.0, lab: [65, -6, -32] }
  ]
}

export const seedRed: MasterbatchInput = {
  id: 2,
  sku: 'MB-Red-215',
  productName: 'Signal Red Prime',
  provider: 'BASF',
  baseCarrierPolymer: 'pe',
  calibration: [
    { letdownPercentage: 0.5, lab: [90, 15, 0] },
    { letdownPercentage: 1.0, lab: [85, 28, 2] },
    { letdownPercentage: 2.0, lab: [75, 48, 5] }
  ]
}

export const seedYellow: MasterbatchInput = {
  id: 3,
  sku: 'MB-Yellow-901',
  productName: 'Solar Yellow Prime',
  provider: 'Ampacet',
  baseCarrierPolymer: 'pe',
  calibration: [
    { letdownPercentage: 0.5, lab: [92, -1, 15] },
    { letdownPercentage: 1.0, lab: [89, -2, 28] },
    { letdownPercentage: 2.0, lab: [84, -3, 45] }
  ]
}

export const seedInventory = [seedBlue, seedRed, seedYellow]
