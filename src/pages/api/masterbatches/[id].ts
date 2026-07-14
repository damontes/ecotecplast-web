import type { APIRoute } from 'astro'
import { createSupabaseServerClient } from '@/lib/supabase/server'

interface CalibrationPointInput {
  letdown_percentage: number
  lab_l: number
  lab_a: number
  lab_b: number
}

interface UpdateBody {
  provider_id?: number | null
  product_name?: string
  supplier_sku?: string
  color_index_num?: string | null
  base_carrier_polymer?: string
  current_stock_kg?: number
  internal_notes?: string | null
  calibration_source?: 'measured' | 'estimated'
  calibration?: CalibrationPointInput[]
}

export const GET: APIRoute = async ({ params, request, cookies }) => {
  const id = Number(params.id)
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400)

  const supabase = createSupabaseServerClient(request, cookies)
  const { data, error } = await supabase
    .from('masterbatches')
    .select(
      `
        id,
        product_name,
        supplier_sku,
        color_index_num,
        base_carrier_polymer,
        current_stock_kg,
        internal_notes,
        calibration_source,
        provider_id,
        providers ( name ),
        calibration_data ( id, letdown_percentage, lab_l, lab_a, lab_b )
      `
    )
    .eq('id', id)
    .single()

  if (error) return json({ error: error.message }, 404)
  return json({ masterbatch: data })
}

export const PUT: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!locals.user?.isAdmin) return json({ error: 'unauthorized' }, 401)
  const id = Number(params.id)
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400)

  let body: UpdateBody
  try {
    body = (await request.json()) as UpdateBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const supabase = createSupabaseServerClient(request, cookies)

  // Update masterbatch fields if any provided.
  const mbUpdates: Record<string, unknown> = {}
  if (body.provider_id !== undefined) mbUpdates.provider_id = body.provider_id ?? null
  if (body.product_name !== undefined) mbUpdates.product_name = body.product_name.trim()
  if (body.supplier_sku !== undefined) mbUpdates.supplier_sku = body.supplier_sku.trim()
  if (body.color_index_num !== undefined) mbUpdates.color_index_num = body.color_index_num?.trim() || null
  if (body.base_carrier_polymer !== undefined) mbUpdates.base_carrier_polymer = body.base_carrier_polymer
  if (body.current_stock_kg !== undefined) mbUpdates.current_stock_kg = body.current_stock_kg
  if (body.internal_notes !== undefined) mbUpdates.internal_notes = body.internal_notes?.trim() || null
  if (body.calibration_source !== undefined) mbUpdates.calibration_source = body.calibration_source

  if (Object.keys(mbUpdates).length > 0) {
    if (mbUpdates.product_name !== undefined && !String(mbUpdates.product_name)) {
      return json({ error: 'product_name_required' }, 400)
    }
    if (mbUpdates.supplier_sku !== undefined && !String(mbUpdates.supplier_sku)) {
      return json({ error: 'supplier_sku_required' }, 400)
    }
    const { error: mbErr } = await supabase.from('masterbatches').update(mbUpdates).eq('id', id)
    if (mbErr) {
      if (mbErr.code === '23505') return json({ error: 'supplier_sku_already_exists' }, 409)
      return json({ error: mbErr.message }, 500)
    }
  }

  // Replace calibration data if provided.
  if (Array.isArray(body.calibration)) {
    if (body.calibration.length < 3) {
      return json({ error: 'calibration_requires_3_points' }, 400)
    }
    for (const pt of body.calibration) {
      if ([pt.lab_l, pt.lab_a, pt.lab_b].some((n) => !Number.isFinite(n))) {
        return json({ error: `invalid_lab_values_at_${pt.letdown_percentage}` }, 400)
      }
    }

    // Delete existing + insert new (simplest path given unique constraint).
    // calibration_data has no organization_id column — scoping is inherited
    // from the parent masterbatch via the RLS policy.
    await supabase.from('calibration_data').delete().eq('masterbatch_id', id)
    const { error: calErr } = await supabase.from('calibration_data').insert(
      body.calibration.map((c) => ({
        masterbatch_id: id,
        letdown_percentage: c.letdown_percentage,
        lab_l: c.lab_l,
        lab_a: c.lab_a,
        lab_b: c.lab_b
      }))
    )
    if (calErr) return json({ error: `calibration_update_failed: ${calErr.message}` }, 500)
  }

  return json({ ok: true })
}

export const DELETE: APIRoute = async ({ params, request, cookies, locals }) => {
  if (!locals.user?.isAdmin) return json({ error: 'unauthorized' }, 401)
  const id = Number(params.id)
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400)

  const supabase = createSupabaseServerClient(request, cookies)
  const { error } = await supabase.from('masterbatches').delete().eq('id', id)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}
