import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

const sbH = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
})

async function sb(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbH() })
  return r.ok ? r.json() : []
}

async function sbPost(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...sbH(), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  return r.ok ? r.json() : null
}

// Extract first word (city name) from "Dallas, TX" → "dallas"
function cityKey(location) {
  if (!location) return ''
  return location.split(',')[0].trim().toLowerCase()
}

function avg(arr) {
  if (!arr.length) return null
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const { user, error: authError } = await verifyAuth(req)
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders(req) })
  }

  const { action } = body

  // ── record ──────────────────────────────────────────────────────────────────
  if (action === 'record') {
    const { origin, destination, rate, miles, equipmentType, brokerId, brokerName } = body

    if (!origin || !destination || rate == null) {
      return Response.json(
        { error: 'origin, destination, and rate are required' },
        { status: 400, headers: corsHeaders(req) }
      )
    }

    const rpm = miles > 0 ? rate / miles : null

    const row = {
      owner_id: user.id,
      origin,
      destination,
      rate: Number(rate),
      miles: miles != null ? Number(miles) : null,
      rpm,
      equipment_type: equipmentType || null,
      broker_id: brokerId || null,
      broker_name: brokerName || null,
      booked_at: new Date().toISOString(),
    }

    await sbPost('rate_intelligence', row)

    return Response.json({ ok: true }, { headers: corsHeaders(req) })
  }

  // ── lane_summary ─────────────────────────────────────────────────────────────
  if (action === 'lane_summary') {
    const { origin, destination, equipmentType } = body

    if (!origin || !destination) {
      return Response.json(
        { error: 'origin and destination are required' },
        { status: 400, headers: corsHeaders(req) }
      )
    }

    const origKey = cityKey(origin)
    const destKey = cityKey(destination)

    let url =
      `rate_intelligence?owner_id=eq.${user.id}` +
      `&origin=ilike.${origKey}%25` +
      `&destination=ilike.${destKey}%25` +
      `&order=booked_at.desc&limit=20&select=rate,rpm,miles`

    if (equipmentType) {
      url += `&equipment_type=ilike.${encodeURIComponent(equipmentType)}`
    }

    const rows = await sb(url)

    if (!rows.length) {
      return Response.json(
        { avgRate: null, avgRpm: null, sampleSize: 0, minRate: null, maxRate: null },
        { headers: corsHeaders(req) }
      )
    }

    const rates = rows.map(r => r.rate).filter(v => v != null)
    const rpms = rows.map(r => r.rpm).filter(v => v != null)

    return Response.json(
      {
        avgRate: avg(rates),
        avgRpm: avg(rpms),
        sampleSize: rows.length,
        minRate: rates.length ? Math.min(...rates) : null,
        maxRate: rates.length ? Math.max(...rates) : null,
      },
      { headers: corsHeaders(req) }
    )
  }

  // ── top_lanes ────────────────────────────────────────────────────────────────
  if (action === 'top_lanes') {
    const since = new Date()
    since.setDate(since.getDate() - 90)
    const sinceIso = since.toISOString()

    const rows = await sb(
      `rate_intelligence?owner_id=eq.${user.id}` +
        `&booked_at=gte.${sinceIso}` +
        `&select=origin,destination,rate,rpm&order=booked_at.desc&limit=500`
    )

    // Group by origin+destination
    const map = {}
    for (const r of rows) {
      const key = `${r.origin}|||${r.destination}`
      if (!map[key]) map[key] = { origin: r.origin, destination: r.destination, rates: [], rpms: [] }
      if (r.rate != null) map[key].rates.push(r.rate)
      if (r.rpm != null) map[key].rpms.push(r.rpm)
    }

    const lanes = Object.values(map)
      .map(g => ({
        origin: g.origin,
        destination: g.destination,
        avgRate: avg(g.rates),
        avgRpm: avg(g.rpms),
        loadCount: g.rates.length,
      }))
      .sort((a, b) => (b.avgRate || 0) - (a.avgRate || 0))
      .slice(0, 5)

    return Response.json({ lanes }, { headers: corsHeaders(req) })
  }

  // ── broker_rate_compare ───────────────────────────────────────────────────────
  if (action === 'broker_rate_compare') {
    const { brokerName } = body

    if (!brokerName) {
      return Response.json({ error: 'brokerName is required' }, { status: 400, headers: corsHeaders(req) })
    }

    const rows = await sb(
      `rate_intelligence?owner_id=eq.${user.id}&select=broker_name,rpm&limit=1000`
    )

    const brokerRows = rows.filter(
      r => r.broker_name && r.broker_name.toLowerCase() === brokerName.toLowerCase()
    )
    const otherRows = rows.filter(
      r => !r.broker_name || r.broker_name.toLowerCase() !== brokerName.toLowerCase()
    )

    const brokerRpms = brokerRows.map(r => r.rpm).filter(v => v != null)
    const otherRpms = otherRows.map(r => r.rpm).filter(v => v != null)
    const allRpms = rows.map(r => r.rpm).filter(v => v != null)

    const brokerAvgRpm = avg(brokerRpms)
    const overallAvgRpm = avg(allRpms)

    return Response.json(
      {
        brokerAvgRpm,
        overallAvgRpm,
        diff: brokerAvgRpm != null && overallAvgRpm != null ? brokerAvgRpm - overallAvgRpm : null,
        sampleSize: brokerRows.length,
      },
      { headers: corsHeaders(req) }
    )
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400, headers: corsHeaders(req) })
}
