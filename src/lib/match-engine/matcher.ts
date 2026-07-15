import { polyfit2, polyval2 } from './polyfit'
import { deltaE2000, deltaE76 } from './delta-e'
import { minimizeSum } from './minimize'

export type Lab = [number, number, number]

export interface MasterbatchInput {
  id: number
  sku: string
  productName: string
  provider?: string
  baseCarrierPolymer?: string
  // Three calibration points at 0.5%, 1.0%, 2.0% — same convention as the
  // reference Python script.
  calibration: {
    letdownPercentage: number
    lab: Lab
  }[]
}

export interface MatchSuccess {
  success: true
  final_delta_e: number
  target_coordinates: Lab
  predicted_coordinates: Lab
  recipe: Array<{
    masterbatch_id: number
    sku: string
    product_name: string
    provider?: string
    percentage: number
  }>
}

export interface MatchFailure {
  success: false
  message: string
  final_delta_e: number
  target_coordinates: Lab
  closest_achievable_coordinates: Lab
  // Closest recipe the optimizer found, even though it doesn't meet the
  // ΔE gate. Useful in monopigmento formulation where the model can hit
  // the target hue (a*/b*) but not the lightness (L*), so ΔE fails the
  // tolerance check but the ratio is still directionally correct and
  // worth surfacing to the operator.
  closest_recipe: Array<{
    masterbatch_id: number
    sku: string
    product_name: string
    provider?: string
    percentage: number
  }>
}

export type MatchResult = MatchSuccess | MatchFailure

export interface RunMatchArgs {
  targetLab: Lab
  baseLab: Lab
  inventory: MasterbatchInput[]
  // Max total colorant concentration (%). Defaults to 4.0 to match the
  // manufacturing constraint in the reference script.
  totalMaxPct?: number
  // Delta E gate above which we declare "out of gamut". Defaults to 1.0.
  passThreshold?: number
}

const MIN_CALIB_POINTS = 3

// ASSUMPTION: baseLab passed to runColorMatch must be the same base
// resin the masterbatch calibration chips were shot against. The current
// implementation computes shifts as `calibration_lab - baseLab`, which
// only produces correct predictions when they match. If you ever need to
// support arbitrary machine baselines (regrind, pre-tinted resin), store
// a `calibration_base_lab` on each masterbatch row and subtract that
// here instead. See related test note in tests/match-engine/matcher.test.ts.

// SCALE-UP ROADMAP (see CLAUDE.md → "Prediction / ML roadmap"):
//   Step 2 — Heuristic MB pre-filter: before building the optimizer, rank
//   MBs by "ΔE-per-% shift toward target" from their calibration curves,
//   keep top ~30. Wire in here, above the `usable` construction. Trigger
//   when per-polymer inventory > ~80 MBs.
//
//   Step 1 — k-NN starting seed from match_history: /api/color-match
//   should query the nearest prior successful run (by ΔE on target+base)
//   and pass its recipe here as an extra initial guess for minimizeSum.
//   Add an optional `initialSeeds: number[][]` param to RunMatchArgs and
//   forward to minimize.ts. Trigger once match_history has ~100 real
//   jobs and repeat-color patterns are visible.
//
//   Both are independent — either can ship on its own.

/**
 * Ports the Python `run_color_match` function.
 *
 * Fit stage: per-masterbatch, per-channel 2nd-degree polynomial of the
 * L*a*b* shift relative to the base resin, as a function of concentration.
 *
 * Predict stage: sum the fitted shifts across all masterbatches to model
 * subtractive mixing.
 *
 * Optimize stage: minimize ΔE (CIE76 during search — faster and monotonic
 * enough — then re-scored under ΔE2000 for the pass/fail gate), subject to
 * per-component bounds [0, 4] and sum ≤ 4.
 */
export function runColorMatch({
  targetLab,
  baseLab,
  inventory,
  totalMaxPct = 4.0,
  passThreshold = 1.0
}: RunMatchArgs): MatchResult {
  if (inventory.length === 0) {
    return {
      success: false,
      message: 'No masterbatches available in inventory.',
      // 999.99 is a sentinel meaning "structurally unreachable" — we can't
      // use Infinity because JSON.stringify(Infinity) === 'null' would blow
      // up any client that reads final_delta_e.toFixed(...).
      final_delta_e: 999.99,
      target_coordinates: targetLab,
      closest_achievable_coordinates: baseLab,
      closest_recipe: []
    }
  }

  // Build the fit curves. Reject any masterbatch missing calibration points.
  type Curves = [
    [number, number, number],
    [number, number, number],
    [number, number, number]
  ]

  const usable: Array<{
    mb: MasterbatchInput
    curves: Curves
    minConc: number  // lowest calibrated concentration for safePredict
  }> = []
  for (const mb of inventory) {
    if (mb.calibration.length < MIN_CALIB_POINTS) continue
    const concs = mb.calibration.map((c) => c.letdownPercentage)
    const dL = mb.calibration.map((c) => c.lab[0] - baseLab[0])
    const dA = mb.calibration.map((c) => c.lab[1] - baseLab[1])
    const dB = mb.calibration.map((c) => c.lab[2] - baseLab[2])
    usable.push({
      mb,
      curves: [polyfit2(concs, dL), polyfit2(concs, dA), polyfit2(concs, dB)],
      minConc: Math.min(...concs)
    })
  }

  if (usable.length === 0) {
    return {
      success: false,
      message: `No masterbatches have the required ${MIN_CALIB_POINTS}-point calibration curve.`,
      // 999.99 is a sentinel meaning "structurally unreachable" — we can't
      // use Infinity because JSON.stringify(Infinity) === 'null' would blow
      // up any client that reads final_delta_e.toFixed(...).
      final_delta_e: 999.99,
      target_coordinates: targetLab,
      closest_achievable_coordinates: baseLab,
      closest_recipe: []
    }
  }

  // Physically-correct evaluation. Below the lowest calibrated concentration,
  // linearly interpolate to (0, 0) — otherwise the polyfit's non-zero
  // constant term lets the optimizer exploit phantom sub-threshold pigment
  // contributions (huge fake ΔE gains from concentrations that produce
  // essentially no color change in reality). Within/above the calibrated
  // range, use polyfit unchanged so no precision is lost where we have data.
  const safeShift = (curve: [number, number, number], c: number, minConc: number): number => {
    if (c <= 0) return 0
    if (c < minConc) {
      const shiftAtMin = polyval2(curve, minConc)
      return (c / minConc) * shiftAtMin
    }
    return polyval2(curve, c)
  }

  const predict = (concentrations: number[]): Lab => {
    let dL = 0, dA = 0, dB = 0
    for (let i = 0; i < usable.length; i++) {
      const c = concentrations[i]
      if (c <= 0) continue
      const { curves, minConc } = usable[i]
      dL += safeShift(curves[0], c, minConc)
      dA += safeShift(curves[1], c, minConc)
      dB += safeShift(curves[2], c, minConc)
    }
    return [baseLab[0] + dL, baseLab[1] + dA, baseLab[2] + dB]
  }

  const objective = (concentrations: number[]): number => {
    return deltaE76(targetLab, predict(concentrations))
  }

  const n = usable.length
  const bounds: Array<[number, number]> = Array(n).fill([0, totalMaxPct]) as Array<[number, number]>
  const initial = Array(n).fill(Math.min(0.5, totalMaxPct / (n * 2)))

  // Deterministic seed derived from the request so same inputs always
  // produce the same recipe. The mix into a 32-bit int is arbitrary but
  // stable — QC teams get reproducible output for the same target.
  const seed =
    Math.abs(
      Math.round(
        (targetLab[0] * 1000 + targetLab[1] * 100 + targetLab[2] * 10) * 7919 +
          (baseLab[0] * 1000 + baseLab[1] * 100 + baseLab[2] * 10) * 104729 +
          usable.reduce((s, u) => s + u.mb.id, 0) * 31
      )
    ) || 1

  const result = minimizeSum(objective, initial, {
    bounds,
    sumMax: totalMaxPct,
    maxIter: 800,
    tol: 1e-8,
    seed,
    // Scale restarts with dimensionality — 5+ pigments needs many more
    // starting points to reliably find the global optimum. Cheap: each
    // restart is a fresh Nelder-Mead, which converges in ~50-100 iter.
    extraRandomRestarts: Math.max(20, n * 4)
  })

  const finalConcentrations = result.x

  // Zero out contributions below the recipe threshold BEFORE computing the
  // predicted Lab and ΔE. Otherwise the polyfit's non-zero constant term
  // (the polynomial doesn't pass through origin when extrapolated below
  // the calibration range) lets phantom sub-threshold pigments contribute
  // huge fake Lab shifts. Symptom: matcher reports ΔE 0.5 with a recipe
  // that in planta produces ΔE 15+. Discovered when adding a 4th/5th
  // strong pigment (e.g. carbon black) to a working inventory.
  const RECIPE_THRESHOLD = 0.01
  const cleanConcentrations = finalConcentrations.map((c) =>
    c > RECIPE_THRESHOLD ? c : 0
  )
  const optimizedLab = predict(cleanConcentrations)
  const finalDeltaE = deltaE2000(targetLab, optimizedLab)

  // Build the recipe regardless of pass/fail — used as `recipe` on success
  // and as `closest_recipe` on out-of-gamut. Uses the same threshold and
  // the same cleaned concentrations that fed the ΔE gate above, so what
  // you see is what will be scored.
  const recipe: MatchSuccess['recipe'] = []
  for (let i = 0; i < usable.length; i++) {
    const pct = cleanConcentrations[i]
    if (pct > 0) {
      recipe.push({
        masterbatch_id: usable[i].mb.id,
        sku: usable[i].mb.sku,
        product_name: usable[i].mb.productName,
        provider: usable[i].mb.provider,
        percentage: round3(pct)
      })
    }
  }

  if (finalDeltaE > passThreshold) {
    return {
      success: false,
      message: 'Target color falls outside current inventory gamut boundaries.',
      final_delta_e: round2(finalDeltaE),
      target_coordinates: targetLab,
      closest_achievable_coordinates: [
        round2(optimizedLab[0]),
        round2(optimizedLab[1]),
        round2(optimizedLab[2])
      ],
      closest_recipe: recipe
    }
  }

  return {
    success: true,
    final_delta_e: round2(finalDeltaE),
    target_coordinates: targetLab,
    predicted_coordinates: [
      round2(optimizedLab[0]),
      round2(optimizedLab[1]),
      round2(optimizedLab[2])
    ],
    recipe
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
