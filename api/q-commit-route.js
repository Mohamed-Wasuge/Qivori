import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const sbH = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
})

/**
 * POST /api/q-commit-route
 * Lock in the week route plan Q recommended.
 * Body: { route_id, legs: [{ origin, destination, est_gross, est_miles }], priority, est_week_gross }
 * Returns: { committed: true, route_id, q_hunting: true }
 */
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  try {
    const { route_id, legs, priority, est_week_gross } = await req.json()
    const userId = req._user.id

    if (!legs?.length) {
      return Response.json({ error: 'legs array required' }, { status: 400, headers: corsHeaders(req) })
    }

    // Store committed route in q_activity
    const routeRecord = {
      user_id: userId,
      type: 'route_committed',
      data: JSON.stringify({
        route_id: route_id || `route_${Date.now()}`,
        legs,
        priority: priority || 'max_earnings',
        est_week_gross: est_week_gross || 0,
        committed_at: new Date().toISOString(),
      }),
      created_at: new Date().toISOString(),
    }

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/q_activity`, {
      method: 'POST',
      headers: { ...sbH(), Prefer: 'return=representation' },
      body: JSON.stringify(routeRecord),
    })

    // Update profile to signal Q should start hunting this route
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { ...sbH(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        q_online: true,
        q_route_plan: JSON.stringify({ legs, priority, est_week_gross, committed_at: new Date().toISOString() }),
      }),
    })

    const inserted = insertRes.ok ? await insertRes.json() : null
    const activityId = inserted?.[0]?.id || route_id || `route_${Date.now()}`

    return Response.json({
      committed: true,
      route_id: activityId,
      q_hunting: true,
      legs_count: legs.length,
      est_week_gross,
      message: `Q is now hunting loads for your ${legs.length}-leg week plan`,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    console.error('[q-commit-route]', err.message)
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
