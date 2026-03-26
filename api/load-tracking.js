import { handleCors, corsHeaders } from './_lib/auth.js'

export const config = { runtime: 'edge' }

/**
 * GET /api/load-tracking?token=<tracking_token>
 *
 * Public (no auth) endpoint for brokers/shippers to check load status.
 * The token is a base64-encoded string of owner_id:load_id that carriers
 * generate and share. Only returns safe, non-sensitive load info.
 */

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'GET') {
    return Response.json({ error: 'GET only' }, { status: 405, headers: corsHeaders(req) })
  }

  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return Response.json({ error: 'Tracking token required' }, { status: 400, headers: corsHeaders(req) })
  }

  // Decode token → owner_id:load_id
  let ownerId, loadId
  try {
    const decoded = atob(token)
    const parts = decoded.split(':')
    if (parts.length !== 2) throw new Error('Invalid token format')
    ownerId = parts[0]
    loadId = parts[1]
  } catch {
    return Response.json({ error: 'Invalid tracking token' }, { status: 400, headers: corsHeaders(req) })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Service unavailable' }, { status: 500, headers: corsHeaders(req) })
  }

  const headers = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }

  try {
    // Fetch the load (only safe fields)
    const loadRes = await fetch(
      `${supabaseUrl}/rest/v1/loads?id=eq.${loadId}&owner_id=eq.${ownerId}&select=id,load_number,status,origin,destination,pickup_date,delivery_date,equipment_type,miles,commodity,weight,stops&limit=1`,
      { headers }
    )
    if (!loadRes.ok) {
      return Response.json({ error: 'Load not found' }, { status: 404, headers: corsHeaders(req) })
    }
    const loads = await loadRes.json()
    if (!loads?.length) {
      return Response.json({ error: 'Load not found' }, { status: 404, headers: corsHeaders(req) })
    }

    const load = loads[0]

    // Fetch carrier company name
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${ownerId}&select=company_name,full_name&limit=1`,
      { headers }
    )
    const profiles = profileRes.ok ? await profileRes.json() : []
    const carrier = profiles[0] || {}

    // Build status timeline
    const STATUS_FLOW = ['Booked', 'Assigned', 'En Route to Pickup', 'Loaded', 'In Transit', 'Delivered', 'Invoiced', 'Paid']
    const currentIdx = STATUS_FLOW.indexOf(load.status)
    const timeline = STATUS_FLOW.slice(0, 7).map((s, i) => ({
      status: s,
      completed: i <= currentIdx,
      current: i === currentIdx,
    }))

    // Parse stops if available
    let stops = []
    if (load.stops && Array.isArray(load.stops)) {
      stops = load.stops.map(s => ({
        type: s.type,
        city: s.city || s.location,
        state: s.state,
        date: s.date,
        arrived: !!s.actual_arrival,
        departed: !!s.actual_departure,
      }))
    }

    return Response.json({
      load_number: load.load_number || load.id,
      status: load.status,
      origin: load.origin,
      destination: load.destination,
      pickup_date: load.pickup_date,
      delivery_date: load.delivery_date,
      equipment: load.equipment_type,
      miles: load.miles,
      commodity: load.commodity,
      weight: load.weight,
      carrier: carrier.company_name || carrier.full_name || 'Carrier',
      timeline,
      stops,
      last_updated: new Date().toISOString(),
    }, { headers: corsHeaders(req) })
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
