import type { APIRoute } from 'astro'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const GET: APIRoute = async ({ request, cookies, params }) => {
  const id = Number(params.id)
  if (!Number.isFinite(id)) {
    return new Response(JSON.stringify({ error: 'invalid_id' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    })
  }

  const supabase = createSupabaseServerClient(request, cookies)
  const { data, error } = await supabase
    .from('match_history')
    .select(
      `
        id,
        job_identifier,
        client_id,
        carrier_polymer_used,
        pass_threshold_used,
        base_l, base_a, base_b,
        target_l, target_a, target_b,
        calculated_recipe,
        final_delta_e,
        is_success,
        created_at,
        clients ( id, name )
      `
    )
    .eq('id', id)
    .single()

  if (error || !data) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    })
  }
  return new Response(JSON.stringify({ job: data }), {
    headers: { 'content-type': 'application/json' }
  })
}
