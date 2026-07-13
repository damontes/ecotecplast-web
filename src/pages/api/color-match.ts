import type { APIRoute } from 'astro'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { runColorMatch, type Lab, type MasterbatchInput } from '@/lib/match-engine/matcher'
import { deltaE2000 } from '@/lib/match-engine/delta-e'

interface RequestBody {
  target: { l: number; a: number; b: number }
  base: { l: number; a: number; b: number }
  client_id?: number | null
  carrier_polymer?: string | null
  masterbatch_ids?: number[]
  // Named QC tolerance chosen by the operator (1.0 / 1.5 / 2.0). Anything
  // else is rejected — the company's ceiling is 2.0 and we don't want
  // free-form drift.
  pass_threshold?: number
}

const ALLOWED_TOLERANCES = new Set([1.0, 1.5, 2.0])

// Suggestion caps per section on the failure screen.
//
// Alternativos (reachable now — "offer this as a substitute"):
//   Only makes sense if the customer might actually accept it. Even a
//   flexible customer won't accept something wildly different from what
//   they asked for. Cap at ΔE 8 (visibly different but same color family).
//
// Adquirir (unreachable — "consider these pigments for procurement"):
//   Wider tolerance since we're saying "buy something that produces this
//   color-region." A red pigment helps reach a red target; a black pigment
//   does not, no matter how "close" the ranking says. Cap at ΔE 20 —
//   above that, we're crossing hue families and the hint is misleading.
const MAX_ALTERNATIVE_DELTA_E = 8
const MAX_ACQUISITION_DELTA_E = 20
const MAX_ALTERNATIVES_COUNT = 4
const MAX_ACQUISITIONS_COUNT = 4
// Hard cap on how many candidate references we consult per request. Each
// candidate triggers a full sub-run of the matcher; this bounds latency.
const MAX_CANDIDATES_INSPECTED = 15

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const user = locals.user
  if (!user || !user.isAdmin) return json({ error: 'unauthorized' }, 401)

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const targetLab = triple(body?.target)
  const baseLab = triple(body?.base)
  if (!targetLab || !baseLab) return json({ error: 'missing_lab_coordinates' }, 400)
  if (!body.client_id) return json({ error: 'client_required' }, 400)
  if (!body.carrier_polymer) return json({ error: 'carrier_polymer_required' }, 400)

  const passThreshold = Number(body.pass_threshold ?? 1.0)
  if (!ALLOWED_TOLERANCES.has(passThreshold)) {
    return json({ error: 'invalid_pass_threshold' }, 400)
  }

  const supabase = createSupabaseServerClient(request, cookies)

  let query = supabase
    .from('masterbatches')
    .select(
      `
        id,
        supplier_sku,
        product_name,
        base_carrier_polymer,
        providers ( name ),
        calibration_data ( letdown_percentage, lab_l, lab_a, lab_b )
      `
    )
    .eq('base_carrier_polymer', body.carrier_polymer)

  if (body.masterbatch_ids && body.masterbatch_ids.length > 0) {
    query = query.in('id', body.masterbatch_ids)
  }

  const { data: rows, error } = await query
  if (error) return json({ error: 'db_read_failed', detail: error.message }, 500)

  const inventory = toInventory(rows ?? [])

  // Early exit: no masterbatches at all for this polymer means the client's
  // configuration doesn't match anything in the inventory. Return a specific
  // error the UI can render as a helpful hint (rather than running the
  // matcher and getting an unreachable 999.99 ΔE that looks like a bug).
  if (inventory.length === 0) {
    return json(
      {
        error: 'empty_inventory_for_polymer',
        polymer: body.carrier_polymer,
        message: `No hay masterbatches registrados con polímero portador ${body.carrier_polymer?.toUpperCase()}. Agrega uno en el Laboratorio de Calibración o cambia el polímero seleccionado.`
      },
      422
    )
  }

  const result = runColorMatch({ targetLab, baseLab, inventory, passThreshold })

  // On out-of-gamut, surface the closest reference colors to the target
  // so admins know what pigments they'd need to acquire. Each candidate is
  // annotated as:
  //   * `reachable_now`: engine could produce it with current inventory →
  //     the recipe is included, and the customer could accept this as-is.
  //   * NOT reachable_now: the pigment set can't get to it → the admin
  //     should treat this as a procurement hint ("acquire pigments capable
  //     of producing colors like this to reach the target"). No recipe is
  //     returned because we don't have calibration data for hypothetical
  //     pigments.
  let suggestions: Array<{
    id: number
    palette: string
    code: string
    name: string
    lab: Lab
    delta_e_to_target: number
    reachable_now: boolean
    recipe: Array<{ masterbatch_id: number; sku: string; product_name: string; percentage: number }> | null
  }> = []

  if (!result.success) {
    const { data: refs } = await supabase
      .from('color_references')
      .select('id, palette, code, name, lab_l, lab_a, lab_b')

    if (refs && refs.length > 0) {
      // Rank references by ΔE2000. We inspect up to N candidates and fill
      // two buckets:
      //   * Alternativos (reachable now, ΔE ≤ 8) — offer to customer
      //   * Adquirir (unreachable, ΔE ≤ 20) — procurement hint
      // A candidate that's reachable but has ΔE > 8 is neither — it's
      // technically makeable but too far off to be a real substitute
      // (e.g., Iron Grey suggested for a red target). Same for unreachable
      // colors with ΔE > 20 (Jet Black as a hint for red-orange).
      const ranked = refs
        .map((r) => {
          const lab: Lab = [Number(r.lab_l), Number(r.lab_a), Number(r.lab_b)]
          return {
            ref: r,
            lab,
            delta_e_to_target: deltaE2000(targetLab, lab)
          }
        })
        .sort((a, b) => a.delta_e_to_target - b.delta_e_to_target)
        .slice(0, MAX_CANDIDATES_INSPECTED)

      let alternativesCount = 0
      let acquisitionsCount = 0

      for (const cand of ranked) {
        // Early exit once both buckets are full — avoids running the
        // sub-matcher for candidates we can't use anyway.
        if (
          alternativesCount >= MAX_ALTERNATIVES_COUNT &&
          acquisitionsCount >= MAX_ACQUISITIONS_COUNT
        ) break

        // Only try to build a recipe if we actually have inventory to work
        // with. Otherwise every candidate is automatically "not reachable".
        const sub = inventory.length > 0
          ? runColorMatch({ targetLab: cand.lab, baseLab, inventory, passThreshold })
          : null

        const reachable = sub?.success === true

        // Decide which bucket this candidate fits — if either — before we
        // pay to build the response entry.
        const fitsAlternative =
          reachable &&
          cand.delta_e_to_target <= MAX_ALTERNATIVE_DELTA_E &&
          alternativesCount < MAX_ALTERNATIVES_COUNT
        const fitsAcquisition =
          !reachable &&
          cand.delta_e_to_target <= MAX_ACQUISITION_DELTA_E &&
          acquisitionsCount < MAX_ACQUISITIONS_COUNT

        if (!fitsAlternative && !fitsAcquisition) continue

        if (fitsAlternative) alternativesCount++
        if (fitsAcquisition) acquisitionsCount++

        suggestions.push({
          id: cand.ref.id,
          palette: cand.ref.palette,
          code: cand.ref.code,
          name: cand.ref.name,
          lab: cand.lab,
          delta_e_to_target: round2(cand.delta_e_to_target),
          reachable_now: reachable,
          recipe: reachable && sub && sub.success
            ? sub.recipe.map((r) => ({
                masterbatch_id: r.masterbatch_id,
                sku: r.sku,
                product_name: r.product_name,
                percentage: r.percentage
              }))
            : null
        })
      }
    }
  }

  const historyPayload = {
    client_id: body.client_id,
    carrier_polymer_used: body.carrier_polymer,
    pass_threshold_used: passThreshold,
    base_l: baseLab[0],
    base_a: baseLab[1],
    base_b: baseLab[2],
    target_l: targetLab[0],
    target_a: targetLab[1],
    target_b: targetLab[2],
    // Persist result + suggestions together so job detail pages can render
    // the full failure view (colors, chromaticity plot, Adquirir/Alternativos)
    // without re-running the matcher.
    calculated_recipe: { ...result, suggestions },
    final_delta_e: Number.isFinite(result.final_delta_e) ? result.final_delta_e : null,
    is_success: result.success,
    created_by: user.id,
    organization_id: user.organizationId
    // job_identifier is auto-populated by a trigger (EP-YYYY-NNNN).
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('match_history')
    .insert(historyPayload)
    .select('id, job_identifier, created_at')
    .single()

  if (insertErr) {
    // Log server-side so it shows in `pnpm dev` terminal. Historically we
    // swallowed this as a "warning" field on the response, which meant the
    // frontend rendered a successful match but no history was ever saved
    // — invisible unless someone read the JSON.
    console.error('[color-match] match_history insert failed:', {
      code: insertErr.code,
      message: insertErr.message,
      details: insertErr.details,
      hint: insertErr.hint,
      payload: historyPayload
    })
  }

  const meta = {
    job_identifier: inserted?.job_identifier ?? null,
    match_history_id: inserted?.id ?? null,
    created_at: inserted?.created_at ?? null,
    client_id: body.client_id,
    carrier_polymer: body.carrier_polymer,
    pass_threshold: passThreshold,
    suggestions,
    ...(insertErr
      ? {
          persist_warning: insertErr.message,
          persist_error_code: insertErr.code,
          persist_error_details: insertErr.details ?? null,
          persist_error_hint: insertErr.hint ?? null
        }
      : {})
  }

  return json({ ...result, ...meta })
}

function toInventory(
  rows: Array<{
    id: number
    supplier_sku: string
    product_name: string
    base_carrier_polymer: string
    providers: { name?: string } | { name?: string }[] | null
    calibration_data: Array<{
      letdown_percentage: number
      lab_l: number
      lab_a: number
      lab_b: number
    }>
  }>
): MasterbatchInput[] {
  return rows.map((r) => {
    const provider = Array.isArray(r.providers)
      ? r.providers[0]?.name
      : r.providers?.name
    return {
      id: r.id,
      sku: r.supplier_sku,
      productName: r.product_name,
      baseCarrierPolymer: r.base_carrier_polymer,
      provider,
      calibration: (r.calibration_data ?? []).map((c) => ({
        letdownPercentage: Number(c.letdown_percentage),
        lab: [Number(c.lab_l), Number(c.lab_a), Number(c.lab_b)] as Lab
      }))
    }
  })
}

function triple(v: unknown): Lab | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const l = Number(o.l)
  const a = Number(o.a)
  const b = Number(o.b)
  if ([l, a, b].some((n) => !Number.isFinite(n))) return null
  return [l, a, b]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}
