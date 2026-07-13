import type { APIRoute } from 'astro'
import { createSupabaseServerClient } from '@/lib/supabase/server'

interface UpdateBody {
  name?: string
  contact_email?: string | null
  contact_phone?: string | null
  default_carrier_polymer?: string | null
  notes?: string | null
}

export const GET: APIRoute = async ({ request, cookies, params }) => {
  const id = Number(params.id)
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400)

  const supabase = createSupabaseServerClient(request, cookies)

  const [{ data: client, error: cErr }, { data: jobs, error: jErr }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, contact_email, contact_phone, default_carrier_polymer, notes, created_at')
      .eq('id', id)
      .single(),
    supabase
      .from('match_history')
      .select('id, is_success')
      .eq('client_id', id)
  ])

  if (cErr || !client) return json({ error: 'not_found' }, 404)
  if (jErr) return json({ error: jErr.message }, 500)

  const total = jobs?.length ?? 0
  const passes = jobs?.filter((j) => j.is_success).length ?? 0

  return json({ client, stats: { total, passes, failures: total - passes } })
}

export const PUT: APIRoute = async ({ request, cookies, params, locals }) => {
  if (!locals.user?.isAdmin) return json({ error: 'unauthorized' }, 401)
  const id = Number(params.id)
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400)

  let body: UpdateBody
  try {
    body = (await request.json()) as UpdateBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.contact_email !== undefined) updates.contact_email = body.contact_email?.trim() || null
  if (body.contact_phone !== undefined) updates.contact_phone = body.contact_phone?.trim() || null
  if (body.default_carrier_polymer !== undefined) updates.default_carrier_polymer = body.default_carrier_polymer || null
  if (body.notes !== undefined) updates.notes = body.notes?.trim() || null

  if (Object.keys(updates).length === 0) return json({ error: 'no_changes' }, 400)
  if (updates.name !== undefined && !String(updates.name)) return json({ error: 'name_required' }, 400)

  const supabase = createSupabaseServerClient(request, cookies)
  const { error } = await supabase.from('clients').update(updates).eq('id', id)
  if (error) {
    if (error.code === '23505') return json({ error: 'client_name_exists' }, 409)
    return json({ error: error.message }, 500)
  }
  return json({ ok: true })
}

export const DELETE: APIRoute = async ({ request, cookies, params, locals }) => {
  if (!locals.user?.isAdmin) return json({ error: 'unauthorized' }, 401)
  const id = Number(params.id)
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400)

  const supabase = createSupabaseServerClient(request, cookies)
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}
