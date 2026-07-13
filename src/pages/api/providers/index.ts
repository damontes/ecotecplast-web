import type { APIRoute } from 'astro'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const GET: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(request, cookies)
  const { data, error } = await supabase.from('providers').select('id, name').order('name')
  if (error) return json({ error: error.message }, 500)
  return json({ providers: data ?? [] })
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user?.isAdmin) return json({ error: 'unauthorized' }, 401)

  let body: { name?: string }
  try {
    body = (await request.json()) as { name?: string }
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const name = body.name?.trim()
  if (!name) return json({ error: 'name_required' }, 400)

  const supabase = createSupabaseServerClient(request, cookies)
  const { data, error } = await supabase
    .from('providers')
    .insert({ name, organization_id: locals.user.organizationId })
    .select('id, name')
    .single()
  if (error) {
    if (error.code === '23505') return json({ error: 'provider_name_exists' }, 409)
    return json({ error: error.message }, 500)
  }
  return json({ provider: data }, 201)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}
