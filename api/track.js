import { handleCors, corsHeaders } from './_lib/auth.js'
import { verifyTrackingTokenCompat } from './_lib/tracking-token.js'

export const config = { runtime: 'edge' }

/**
 * GET /api/track?token=xxx
 *
 * Public endpoint — NO auth required (uses HMAC tracking token).
 * Returns safe, non-sensitive load info for shipper/broker tracking.
 * Never exposes: rate, invoice amount, driver full name, broker payment details.
 */

const STATUS_FLOW = ['Rate Con Received', 'Booked', 'Dispatched', 'En Route to Pickup', 'Loaded', 'In Transit', 'Delivered', 'Invoiced', 'Paid']

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

  // Verify token (supports both HMAC and legacy format)
  const { valid, loadId, ownerId, error: tokenError } = await verifyTrackingTokenCompat(token)
  if (!valid) {
    return Response.json({ error: tokenError || 'Invalid tracking token' }, { status: 403, headers: corsHeaders(req) })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Service unavailable' }, { status: 500, headers: corsHeaders(req) })
  }

  const dbHeaders = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }

  try {
    // Fetch the load — only safe fields, never rate/invoice data
    const loadRes = await fetch(
      `${supabaseUrl}/rest/v1/loads?id=eq.${loadId}&owner_id=eq.${ownerId}&select=id,load_id,load_number,status,origin,destination,pickup_date,delivery_date,equipment,miles,commodity,weight,carrier_name,updated_at&limit=1`,
      { headers: dbHeaders }
    )
    if (!loadRes.ok) {
      return Response.json({ error: 'Load not found' }, { status: 404, headers: corsHeaders(req) })
    }
    const loads = await loadRes.json()
    if (!loads?.length) {
      return Response.json({ error: 'Load not found' }, { status: 404, headers: corsHeaders(req) })
    }

    const load = loads[0]

    // Token expires when load is completed (Paid)
    const COMPLETED_STATUSES = ['Paid']
    if (COMPLETED_STATUSES.includes(load.status)) {
      return Response.json({ error: 'This shipment has been completed. Tracking link is no longer active.' }, { status: 410, headers: corsHeaders(req) })
    }

    // Fetch load stops if any
    let stops = []
    try {
      const stopsRes = await fetch(
        `${supabaseUrl}/rest/v1/load_stops?load_id=eq.${loadId}&select=type,city,state,status,arrived_at,departed_at,sequence&order=sequence.asc`,
        { headers: dbHeaders }
      )
      if (stopsRes.ok) {
        const stopsData = await stopsRes.json()
        stops = (stopsData || []).map(s => ({
          type: s.type || 'stop',
          city: s.city || '',
          state: s.state || '',
          status: s.status || 'pending',
          arrived_at: s.arrived_at || null,
          departed_at: s.departed_at || null,
        }))
      }
    } catch {
      // Stops fetch failed — not critical
    }

    // Extract driver first name only (never expose full name)
    const driverFirstName = (load.carrier_name || '').split(' ')[0] || null

    // Build status timeline for progress bar
    const currentIdx = STATUS_FLOW.indexOf(load.status)
    const displaySteps = ['Booked', 'Dispatched', 'En Route to Pickup', 'In Transit', 'Delivered']
    const timeline = displaySteps.map(s => {
      const stepIdx = STATUS_FLOW.indexOf(s)
      return {
        status: s,
        completed: currentIdx >= stepIdx,
        current: currentIdx === stepIdx,
      }
    })

    // Calculate ETA — if delivery_date exists and load is not delivered
    let eta = null
    if (load.delivery_date && currentIdx < STATUS_FLOW.indexOf('Delivered')) {
      eta = load.delivery_date
    }

    return Response.json({
      load_number: load.load_number || load.load_id || load.id,
      status: load.status,
      origin: load.origin,
      destination: load.destination,
      driver_first_name: driverFirstName,
      pickup_date: load.pickup_date,
      delivery_date: load.delivery_date,
      eta,
      equipment: load.equipment,
      miles: load.miles,
      commodity: load.commodity,
      weight: load.weight,
      timeline,
      stops,
      last_updated: load.updated_at || new Date().toISOString(),
    }, { headers: corsHeaders(req) })
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
