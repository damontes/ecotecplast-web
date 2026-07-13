import type { APIRoute } from 'astro'
import { createSupabaseServerClient } from '@/lib/supabase/server'

interface CreateBody {
  name: string
  contact_email?: string | null
  contact_phone?: string | null
  default_carrier_polymer?: string | null
  notes?: string | null
}

export const GET: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(request, cookies)
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, contact_email, contact_phone, default_carrier_polymer, notes, created_at')
    .order('name')
  if (error) return json({ error: error.message }, 500)
  return json({ clients: data ?? [] })
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user?.isAdmin) return json({ error: 'unauthorized' }, 401)
  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!body.name?.trim()) return json({ error: 'name_required' }, 400)

  const supabase = createSupabaseServerClient(request, cookies)
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name: body.name.trim(),
      contact_email: body.contact_email?.trim() || null,
      contact_phone: body.contact_phone?.trim() || null,
      default_carrier_polymer: body.default_carrier_polymer || null,
      notes: body.notes?.trim() || null,
      organization_id: locals.user.organizationId
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return json({ error: 'client_name_exists' }, 409)
    return json({ error: error.message }, 500)
  }
  return json({ id: data.id }, 201)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}
