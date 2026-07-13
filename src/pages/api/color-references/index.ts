import type { APIRoute } from 'astro'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const GET: APIRoute = async ({ request, cookies, url }) => {
  const palette = url.searchParams.get('palette')
  const supabase = createSupabaseServerClient(request, cookies)
  let q = supabase
    .from('color_references')
    .select('id, palette, code, name, lab_l, lab_a, lab_b')
    .order('palette')
    .order('code')
  if (palette) q = q.eq('palette', palette)
  const { data, error } = await q
  if (error) return json({ error: error.message }, 500)
  return json({ color_references: data ?? [] })
}

interface CreateBody {
  palette: string
  code: string
  name: string
  lab_l: number
  lab_a: number
  lab_b: number
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user?.isAdmin) return json({ error: 'unauthorized' }, 401)

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const palette = body.palette?.trim()
  const code = body.code?.trim()
  const name = body.name?.trim()
  if (!palette || !code || !name) return json({ error: 'palette_code_name_required' }, 400)

  const lab_l = Number(body.lab_l)
  const lab_a = Number(body.lab_a)
  const lab_b = Number(body.lab_b)
  if ([lab_l, lab_a, lab_b].some((n) => !Number.isFinite(n))) {
    return json({ error: 'lab_values_required' }, 400)
  }

  const supabase = createSupabaseServerClient(request, cookies)
  const { data, error } = await supabase
    .from('color_references')
    .insert({ palette, code, name, lab_l, lab_a, lab_b })
    .select('id, palette, code, name, lab_l, lab_a, lab_b')
    .single()

  if (error) {
    if (error.code === '23505') return json({ error: 'palette_code_exists' }, 409)
    return json({ error: error.message }, 500)
  }
  return json({ color_reference: data }, 201)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}
