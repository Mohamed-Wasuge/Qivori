/**
 * /api/load-board-book — book a load from a load board into the user's loads table
 *
 * The missing piece between the load board UI and the rest of the TMS.
 * Before this, AILoadBoard could DISPLAY 123Loadboard/DAT/Truckstop loads
 * but tapping "Accept" or "Counter" only showed a toast — the loads never
 * landed in the loads table where dispatch, invoicing, and Q's negotiation
 * flow live.
 *
 * This endpoint accepts a load board load shape + optional negotiated rate,
 * inserts a row into the loads table with owner_id = current user, status
 * = 'Booked' (or 'Offered' if from_negotiation flag is set), and returns
 * the new load id so the frontend can route to it.
 *
 * Body: {
 *   source: '123loadboard' | 'dat' | 'truckstop' | 'manual',
 *   external_id: string,                   // load board's id (for dedupe)
 *   origin: string, destination: string,   // city/state strings
 *   miles: number,
 *   rate: number,                          // posted rate OR negotiated rate
 *   broker_name: string,
 *   broker_phone?: string, broker_email?: string,
 *   equipment?: string,                    // 'Dry Van' | 'Reefer' | 'Flatbed'
 *   pickup_date?: string (ISO),
 *   delivery_date?: string (ISO),
 *   weight?: string,
 *   commodity?: string,
 *   reference_number?: string,
 *   from_negotiation?: boolean,            // true → status='Offered', false → 'Booked'
 * }
 *
 * Returns: { ok: true, load_id, load_number }
 */
import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
})

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return Response.json({ error: 'Server not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const {
      source,
      external_id,
      origin,
      destination,
      miles,
      rate,
      broker_name,
      broker_phone,
      broker_email,
      equipment,
      pickup_date,
      delivery_date,
      weight,
      commodity,
      reference_number,
      from_negotiation,
    } = body

    if (!origin || !destination) {
      return Response.json({ error: 'origin and destination required' }, { status: 400, headers: corsHeaders(req) })
    }
    if (!rate || Number(rate) <= 0) {
      return Response.json({ error: 'rate required' }, { status: 400, headers: corsHeaders(req) })
    }

    // Dedupe check — if a load with this external_id already exists for
    // this user, return the existing one instead of creating a duplicate
    if (external_id) {
      const dedupeRes = await fetch(
        `${SUPABASE_URL}/rest/v1/loads?owner_id=eq.${user.id}&reference_number=eq.${encodeURIComponent(external_id)}&select=id,load_id,status&limit=1`,
        { headers: sbHeaders() }
      )
      if (dedupeRes.ok) {
        const existing = await dedupeRes.json()
        if (Array.isArray(existing) && existing.length > 0) {
          return Response.json({
            ok: true,
            load_id: existing[0].id,
            load_number: existing[0].load_id,
            duplicate: true,
            status: existing[0].status,
          }, { headers: corsHeaders(req) })
        }
      }
    }

    // Generate a load_id if the auto-trigger doesn't fire
    const loadIdShort = `Q-${source ? source.toUpperCase().slice(0, 3) : 'LB'}-${Math.floor(Math.random() * 10000)}`

    // Initial status — 'Offered' if it came from the negotiation flow,
    // otherwise 'Booked' (user accepted as-is from the load board)
    const status = from_negotiation ? 'Offered' : 'Booked'

    // Compute rate per mile if we have miles
    const ratePerMile = miles && Number(miles) > 0
      ? Number((Number(rate) / Number(miles)).toFixed(2))
      : null

    // Insert the load
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/loads`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({
        owner_id: user.id,
        load_id: loadIdShort,
        origin,
        destination,
        miles: miles ? Number(miles) : null,
        rate: Number(rate),
        rate_per_mile: ratePerMile,
        broker_name: broker_name || null,
        broker_phone: broker_phone || null,
        broker_email: broker_email || null,
        equipment: equipment || 'Dry Van',
        pickup_date: pickup_date || null,
        delivery_date: delivery_date || null,
        weight: weight || null,
        commodity: commodity || null,
        reference_number: external_id || reference_number || null,
        load_source: source || 'load_board',
        status,
      }),
    })

    if (!insertRes.ok) {
      const errText = await insertRes.text()
      return Response.json({ error: 'Insert failed: ' + errText }, { status: 500, headers: corsHeaders(req) })
    }

    const inserted = await insertRes.json()
    const loadRow = Array.isArray(inserted) ? inserted[0] : inserted

    return Response.json({
      ok: true,
      load_id: loadRow.id,
      load_number: loadRow.load_id,
      status: loadRow.status,
    }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error: ' + err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
