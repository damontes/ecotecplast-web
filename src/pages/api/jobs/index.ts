import type { APIRoute } from 'astro'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const GET: APIRoute = async ({ request, cookies, url }) => {
  const supabase = createSupabaseServerClient(request, cookies)

  const clientId = url.searchParams.get('client_id')
  const dateFrom = url.searchParams.get('date_from')
  const dateTo = url.searchParams.get('date_to')
  const status = url.searchParams.get('status')

  let q = supabase
    .from('match_history')
    .select(
      `
        id,
        job_identifier,
        client_id,
        carrier_polymer_used,
        target_l, target_a, target_b,
        base_l, base_a, base_b,
        final_delta_e,
        is_success,
        created_at,
        clients ( name )
      `
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (clientId) q = q.eq('client_id', Number(clientId))
  if (dateFrom) q = q.gte('created_at', dateFrom)
  if (dateTo) {
    // Extend end-of-day so the filter is inclusive.
    const to = new Date(dateTo)
    to.setHours(23, 59, 59, 999)
    q = q.lte('created_at', to.toISOString())
  }
  if (status === 'success') q = q.eq('is_success', true)
  else if (status === 'failure') q = q.eq('is_success', false)

  const { data, error } = await q
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    })
  }
  return new Response(JSON.stringify({ jobs: data ?? [] }), {
    headers: { 'content-type': 'application/json' }
  })
}
