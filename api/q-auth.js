import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sb() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  }
}

function json(data, status = 200, req) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  })
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'GET') {
    return json({ error: 'GET only' }, 405, req)
  }

  // Verify bearer token
  const { user, error } = await verifyAuth(req)
  if (error || !user?.id) {
    return json({ error: 'Unauthorized' }, 401, req)
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json({ error: 'Server not configured' }, 500, req)
  }

  // Fetch role, mode, assigned_truck_id from profiles
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,mode,assigned_truck_id&limit=1`,
    { headers: sb() }
  )

  if (!profileRes.ok) {
    return json({ error: 'Failed to fetch profile' }, 502, req)
  }

  const rows = await profileRes.json()
  const profile = rows?.[0]

  if (!profile) {
    return json({ error: 'Profile not found' }, 404, req)
  }

  const { role, mode, assigned_truck_id } = profile
  const result = { role, mode, assigned_truck_id }

  // If any role has an assigned truck, fetch the truck's current status + active_load_id
  if (assigned_truck_id) {
    const truckRes = await fetch(
      `${SUPABASE_URL}/rest/v1/vehicles?id=eq.${assigned_truck_id}&select=id,status,active_load_id&limit=1`,
      { headers: sb() }
    )

    if (truckRes.ok) {
      const trucks = await truckRes.json()
      const truck = trucks?.[0]
      if (truck) {
        result.truck = {
          id:             truck.id,
          status:         truck.status,
          active_load_id: truck.active_load_id,
        }
      }
    }
  }

  return json(result, 200, req)
}
