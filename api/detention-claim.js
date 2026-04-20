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
 * POST /api/detention-claim
 * File a detention charge against a broker.
 * Body: { load_id, load_number, broker_name, arrived_at, detention_start, rate_per_hour, hours_detained, stop_type }
 * Returns: { filed: true, amount, claim_id }
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
    const {
      load_id, load_number, broker_name,
      arrived_at, detention_start,
      rate_per_hour = 50,
      hours_detained, stop_type = 'pickup',
    } = await req.json()
    const userId = req._user.id

    if (!load_id && !load_number) {
      return Response.json({ error: 'load_id or load_number required' }, { status: 400, headers: corsHeaders(req) })
    }

    const ratePerHour = parseFloat(rate_per_hour) || 50
    const hours = parseFloat(hours_detained) || 0

    if (hours <= 0) {
      return Response.json({ error: 'hours_detained must be greater than 0' }, { status: 400, headers: corsHeaders(req) })
    }

    const amount = Math.round(ratePerHour * hours * 100) / 100

    // Insert detention record
    const detentionRecord = {
      user_id: userId,
      load_id: load_id || null,
      load_number: load_number || null,
      broker_name: broker_name || null,
      arrived_at: arrived_at || null,
      detention_start: detention_start || null,
      rate_per_hour: ratePerHour,
      hours_detained: hours,
      amount,
      stop_type,
      status: 'filed',
      filed_at: new Date().toISOString(),
    }

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/detention_records`, {
      method: 'POST',
      headers: { ...sbH(), Prefer: 'return=representation' },
      body: JSON.stringify(detentionRecord),
    })

    const inserted = insertRes.ok ? await insertRes.json() : null
    const claimId = inserted?.[0]?.id || `det_${Date.now()}`

    // Log Q activity
    await fetch(`${SUPABASE_URL}/rest/v1/q_activity`, {
      method: 'POST',
      headers: { ...sbH(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: userId,
        type: 'detention_filed',
        data: JSON.stringify({
          claim_id: claimId,
          load_number,
          broker: broker_name,
          hours,
          amount,
          stop_type,
        }),
        created_at: new Date().toISOString(),
      }),
    })

    // Update load record with detention flag
    if (load_id) {
      await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load_id}`, {
        method: 'PATCH',
        headers: { ...sbH(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          detention_filed: true,
          detention_amount: amount,
          detention_hours: hours,
        }),
      })
    }

    return Response.json({
      filed: true,
      claim_id: claimId,
      load_number,
      broker: broker_name,
      hours_detained: hours,
      rate_per_hour: ratePerHour,
      amount,
      stop_type,
      message: `Detention claim of $${amount} filed against ${broker_name || 'broker'} for ${hours}h at ${stop_type}`,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    console.error('[detention-claim]', err.message)
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
