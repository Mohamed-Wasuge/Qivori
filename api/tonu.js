import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const sbH = () => ({
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

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return Response.json({ error: 'Missing env vars' }, { status: 500, headers: corsHeaders(req) })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders(req) })
  }

  const { action } = body

  try {
    // ── file ───────────────────────────────────────────────────────────────────
    if (action === 'file') {
      const { loadId, truckId, driverId, brokerName, brokerEmail, tonuRate, reason } = body
      if (!loadId || !truckId || !driverId || !brokerName) {
        return Response.json({ error: 'loadId, truckId, driverId, brokerName required' }, { status: 400, headers: corsHeaders(req) })
      }

      const rate = tonuRate || 150
      const filedAt = new Date().toISOString()

      // 1. Fetch load info
      const loadRes = await fetch(
        `${SUPABASE_URL}/rest/v1/loads?id=eq.${loadId}&select=load_number,origin,destination,rate,gross_pay,broker,broker_email`,
        { headers: sbH() }
      )
      const loads = await loadRes.json()
      const load = loads?.[0] || {}

      const loadNumber = load.load_number || null
      const origin = load.origin || null
      const destination = load.destination || null
      const resolvedBrokerEmail = brokerEmail || load.broker_email || null

      // 2. Insert q_activity
      await fetch(`${SUPABASE_URL}/rest/v1/q_activity`, {
        method: 'POST',
        headers: { ...sbH(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          truck_id: truckId,
          driver_id: driverId,
          type: 'tonu',
          content: {
            message: 'Load cancelled at shipper. TONU claim filed.',
            load_id: loadId,
            load_number: loadNumber,
            origin,
            destination,
            tonu_rate: rate,
            broker_name: brokerName,
            broker_email: resolvedBrokerEmail,
            reason: reason || null,
            status: 'submitted',
            filed_at: filedAt,
          },
        }),
      })

      // 3. PATCH load status
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${loadId}`, {
        method: 'PATCH',
        headers: { ...sbH(), Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'tonu_filed', tonu_rate: rate }),
      })
      if (!patchRes.ok) {
        console.error('[tonu] load patch failed')
        // Non-fatal — q_activity was already written
      }

      // 4. Email skipped per spec — log only
      if (resolvedBrokerEmail) {
        console.log(`[tonu] TONU demand would send to ${resolvedBrokerEmail} for load ${loadNumber || loadId}, amount $${rate}`)
      }

      return Response.json({
        ok: true,
        tonuRate: rate,
        message: `TONU claim filed. Amount: $${rate}`,
      }, { headers: corsHeaders(req) })
    }

    // ── status ─────────────────────────────────────────────────────────────────
    if (action === 'status') {
      const { loadId } = body
      if (!loadId) {
        return Response.json({ error: 'loadId required' }, { status: 400, headers: corsHeaders(req) })
      }

      // q_activity content is JSONB — filter by type and content->>'load_id'
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/q_activity?type=eq.tonu&content->>load_id=eq.${loadId}&order=created_at.desc&limit=1`,
        { headers: sbH() }
      )
      const rows = await res.json()

      return Response.json({ ok: true, record: rows?.[0] || null }, { headers: corsHeaders(req) })
    }

    return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders(req) })

  } catch (err) {
    console.error('[tonu] Error:', err.message)
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
