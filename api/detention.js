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
    // ── start ──────────────────────────────────────────────────────────────────
    if (action === 'start') {
      const { loadId, truckId, driverId, locationType, freeTimeHours } = body
      if (!loadId || !truckId || !driverId || !locationType) {
        return Response.json({ error: 'loadId, truckId, driverId, locationType required' }, { status: 400, headers: corsHeaders(req) })
      }

      const arrivedAt = new Date().toISOString()
      const freeHours = freeTimeHours || 2

      const detRes = await fetch(`${SUPABASE_URL}/rest/v1/detention_records`, {
        method: 'POST',
        headers: { ...sbH(), Prefer: 'return=representation' },
        body: JSON.stringify({
          load_id: loadId,
          truck_id: truckId,
          driver_id: driverId,
          location_type: locationType,
          free_time_hours: freeHours,
          arrived_at: arrivedAt,
          status: 'counting_free_time',
        }),
      })
      const detRows = await detRes.json()
      if (!detRes.ok) {
        console.error('[detention] start insert error:', detRows)
        return Response.json({ error: 'Failed to create detention record', detail: detRows }, { status: 500, headers: corsHeaders(req) })
      }
      const detentionId = detRows?.[0]?.id

      await fetch(`${SUPABASE_URL}/rest/v1/q_activity`, {
        method: 'POST',
        headers: { ...sbH(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          truck_id: truckId,
          driver_id: driverId,
          type: 'detention',
          content: {
            message: `Free time clock started at ${locationType}. ${freeHours}h free time window.`,
            load_id: loadId,
            location_type: locationType,
            free_time_hours: freeHours,
            arrived_at: arrivedAt,
          },
        }),
      })

      return Response.json({
        ok: true,
        detentionId,
        message: `Detention clock started. Free time: ${freeHours}h.`,
      }, { headers: corsHeaders(req) })
    }

    // ── triggered ──────────────────────────────────────────────────────────────
    if (action === 'triggered') {
      const { detentionId, ratePerHour } = body
      if (!detentionId) {
        return Response.json({ error: 'detentionId required' }, { status: 400, headers: corsHeaders(req) })
      }

      const rate = ratePerHour || 75
      const detentionStartedAt = new Date().toISOString()

      // Fetch existing record for truck/driver context
      const fetchRes = await fetch(`${SUPABASE_URL}/rest/v1/detention_records?id=eq.${detentionId}&select=truck_id,driver_id,load_id`, {
        headers: sbH(),
      })
      const rows = await fetchRes.json()
      const rec = rows?.[0]

      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/detention_records?id=eq.${detentionId}`, {
        method: 'PATCH',
        headers: { ...sbH(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'billing',
          detention_started_at: detentionStartedAt,
          rate_per_hour: rate,
        }),
      })
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}))
        console.error('[detention] triggered patch error:', err)
        return Response.json({ error: 'Failed to update detention record' }, { status: 500, headers: corsHeaders(req) })
      }

      if (rec) {
        await fetch(`${SUPABASE_URL}/rest/v1/q_activity`, {
          method: 'POST',
          headers: { ...sbH(), Prefer: 'return=minimal' },
          body: JSON.stringify({
            truck_id: rec.truck_id,
            driver_id: rec.driver_id,
            type: 'detention',
            content: {
              message: `Detention clock started — $${rate}/hr billing`,
              load_id: rec.load_id,
              rate_per_hour: rate,
              detention_started_at: detentionStartedAt,
            },
          }),
        })
      }

      return Response.json({ ok: true }, { headers: corsHeaders(req) })
    }

    // ── end ────────────────────────────────────────────────────────────────────
    if (action === 'end') {
      const { detentionId } = body
      if (!detentionId) {
        return Response.json({ error: 'detentionId required' }, { status: 400, headers: corsHeaders(req) })
      }

      const fetchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/detention_records?id=eq.${detentionId}&select=detention_started_at,rate_per_hour,truck_id,driver_id,load_id`,
        { headers: sbH() }
      )
      const rows = await fetchRes.json()
      const rec = rows?.[0]

      const departedAt = new Date().toISOString()
      let totalCharged = 0
      let hoursBilled = 0

      if (rec?.detention_started_at) {
        const ms = new Date(departedAt) - new Date(rec.detention_started_at)
        hoursBilled = Math.round((ms / 3600000) * 100) / 100
        totalCharged = Math.round(hoursBilled * (rec.rate_per_hour || 75) * 100) / 100
      }

      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/detention_records?id=eq.${detentionId}`, {
        method: 'PATCH',
        headers: { ...sbH(), Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'completed', departed_at: departedAt }),
      })
      if (!patchRes.ok) {
        console.error('[detention] end patch error')
        return Response.json({ error: 'Failed to close detention record' }, { status: 500, headers: corsHeaders(req) })
      }

      if (rec) {
        await fetch(`${SUPABASE_URL}/rest/v1/q_activity`, {
          method: 'POST',
          headers: { ...sbH(), Prefer: 'return=minimal' },
          body: JSON.stringify({
            truck_id: rec.truck_id,
            driver_id: rec.driver_id,
            type: 'detention',
            content: {
              message: `Detention ended — $${totalCharged} total charged`,
              load_id: rec.load_id,
              total_charged: totalCharged,
              hours_billed: hoursBilled,
              departed_at: departedAt,
            },
          }),
        })
      }

      return Response.json({ ok: true, totalCharged, hoursBilled }, { headers: corsHeaders(req) })
    }

    // ── status ─────────────────────────────────────────────────────────────────
    if (action === 'status') {
      const { loadId, detentionId } = body
      if (!loadId && !detentionId) {
        return Response.json({ error: 'loadId or detentionId required' }, { status: 400, headers: corsHeaders(req) })
      }

      const filter = detentionId
        ? `id=eq.${detentionId}`
        : `load_id=eq.${loadId}&order=created_at.desc&limit=1`

      const res = await fetch(`${SUPABASE_URL}/rest/v1/detention_records?${filter}`, { headers: sbH() })
      const rows = await res.json()

      return Response.json({ ok: true, record: rows?.[0] || null }, { headers: corsHeaders(req) })
    }

    return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders(req) })

  } catch (err) {
    console.error('[detention] Error:', err.message)
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
