/**
 * GET /api/lane-history-cron
 * Weekly cron: aggregates delivered loads into lane_history + computes lane_predictions.
 * Schedule: Every Monday at 2 AM UTC
 * Also supports POST for manual/backfill runs.
 */
import { handleCors, corsHeaders } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

function sbHeaders(prefer) {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...(prefer ? { 'Prefer': prefer } : {}),
  }
}

// ── Seasonality (same as dispatch-evaluate.js) ───────────────────────────────

const SEASONAL = {
  midwest:   [0.88,0.85,0.95,1.05,1.10,1.08,1.05,1.00,1.02,1.12,1.15,1.08],
  southeast: [0.90,0.88,0.95,1.08,1.12,1.10,1.06,1.02,1.00,1.08,1.10,1.05],
  northeast: [0.92,0.88,0.98,1.05,1.08,1.05,1.00,0.98,1.02,1.10,1.12,1.08],
  west:      [0.90,0.88,0.95,1.10,1.15,1.12,1.08,1.05,1.02,1.08,1.10,1.05],
  south:     [0.88,0.85,0.92,1.05,1.10,1.08,1.05,1.02,1.00,1.10,1.12,1.06],
}
const REGIONS = {
  midwest:   ['IL','IN','OH','MI','WI','MN','IA','MO','KS','NE','SD','ND'],
  southeast: ['FL','GA','SC','NC','VA','AL','MS','TN','KY','WV','AR','LA'],
  northeast: ['NY','NJ','PA','CT','MA','RI','VT','NH','ME','MD','DE','DC'],
  west:      ['CA','WA','OR','NV','AZ','UT','CO','ID','MT','WY','NM'],
  south:     ['TX','OK'],
}

function getSeasonMultiplier(state) {
  const s = (state || '').toUpperCase()
  const month = new Date().getMonth()
  for (const [region, states] of Object.entries(REGIONS)) {
    if (states.includes(s)) return SEASONAL[region][month]
  }
  return SEASONAL.midwest[month]
}

function extractState(location) {
  if (!location) return ''
  const parts = location.split(',')
  const last = (parts[parts.length - 1] || '').trim().replace(/[^A-Za-z]/g, '').toUpperCase()
  return last.length === 2 ? last : ''
}

function getMonday(date) {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
  d.setUTCDate(diff)
  return d.toISOString().split('T')[0]
}

// ── Trend Detection ──────────────────────────────────────────────────────────

function detectTrend(weeklyData) {
  if (weeklyData.length < 3) return { trend: 'stable', trend_pct: 0, confidence: 25 }

  const recent = weeklyData[0].avg_rpm
  const prevWeeks = weeklyData.slice(1, 5)
  const prevAvg = prevWeeks.reduce((s, w) => s + parseFloat(w.avg_rpm), 0) / prevWeeks.length

  if (prevAvg === 0) return { trend: 'stable', trend_pct: 0, confidence: 25 }

  const pctChange = ((recent - prevAvg) / prevAvg) * 100
  const totalLoads = weeklyData.reduce((s, w) => s + (w.load_count || 0), 0)
  const confidence = Math.min(95, 25 + weeklyData.length * 7 + Math.min(totalLoads * 2, 20))

  return {
    trend: pctChange > 3 ? 'rising' : pctChange < -3 ? 'falling' : 'stable',
    trend_pct: Math.round(pctChange * 100) / 100,
    confidence,
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // Auth: cron secret or POST with secret
  const auth = req.headers.get('authorization') || ''
  if (auth !== `Bearer ${CRON_SECRET}` && !CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const weeksBack = body.weeks_back || 1 // How many weeks to process (1 for cron, more for backfill)

    // Get all distinct owners with delivered loads
    const ownersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/loads?status=in.(Delivered,Invoiced)&select=owner_id&limit=500`,
      { headers: sbHeaders() }
    )
    if (!ownersRes.ok) throw new Error('Failed to fetch owners')
    const ownerRows = await ownersRes.json()
    const ownerIds = [...new Set(ownerRows.map(r => r.owner_id).filter(Boolean))]

    const results = []

    for (const ownerId of ownerIds) {
      // Fetch delivered loads from the past N weeks
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - weeksBack * 7)

      const loadsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/loads?owner_id=eq.${ownerId}&status=in.(Delivered,Invoiced)&created_at=gte.${cutoff.toISOString()}&select=origin,destination,rate,miles,equipment,broker_name,created_at&limit=500`,
        { headers: sbHeaders() }
      )
      if (!loadsRes.ok) continue
      const loads = await loadsRes.json()
      if (!loads.length) continue

      // Group by (origin_state, dest_state, week)
      const lanes = {}
      for (const load of loads) {
        const originState = extractState(load.origin)
        const destState = extractState(load.destination)
        if (!originState || !destState) continue

        const rate = parseFloat(load.rate) || 0
        const miles = parseInt(load.miles) || 0
        if (rate <= 0 || miles <= 0) continue

        const weekStart = getMonday(load.created_at)
        const key = `${originState}|${destState}|${weekStart}`

        if (!lanes[key]) {
          lanes[key] = {
            origin_state: originState, dest_state: destState, week_start: weekStart,
            rates: [], rpms: [], miles: [], grosses: [], equipment: {}, brokers: {},
          }
        }

        const rpm = rate / miles
        lanes[key].rates.push(rate)
        lanes[key].rpms.push(rpm)
        lanes[key].miles.push(miles)
        lanes[key].grosses.push(rate)

        // Equipment breakdown
        const eq = load.equipment || 'Dry Van'
        if (!lanes[key].equipment[eq]) lanes[key].equipment[eq] = { count: 0, total_rpm: 0 }
        lanes[key].equipment[eq].count++
        lanes[key].equipment[eq].total_rpm += rpm

        // Broker breakdown
        const broker = load.broker_name || 'Unknown'
        if (!lanes[key].brokers[broker]) lanes[key].brokers[broker] = { count: 0, total_rpm: 0 }
        lanes[key].brokers[broker].count++
        lanes[key].brokers[broker].total_rpm += rpm
      }

      // Upsert lane_history rows
      for (const [, lane] of Object.entries(lanes)) {
        const avgRpm = lane.rpms.reduce((s, r) => s + r, 0) / lane.rpms.length
        const equipBreakdown = {}
        for (const [eq, d] of Object.entries(lane.equipment)) {
          equipBreakdown[eq] = { count: d.count, avg_rpm: Math.round(d.total_rpm / d.count * 100) / 100 }
        }
        const brokerBreakdown = {}
        for (const [b, d] of Object.entries(lane.brokers)) {
          brokerBreakdown[b] = { count: d.count, avg_rpm: Math.round(d.total_rpm / d.count * 100) / 100 }
        }

        const row = {
          owner_id: ownerId,
          origin_state: lane.origin_state,
          dest_state: lane.dest_state,
          week_start: lane.week_start,
          load_count: lane.rpms.length,
          avg_rpm: Math.round(avgRpm * 100) / 100,
          min_rpm: Math.round(Math.min(...lane.rpms) * 100) / 100,
          max_rpm: Math.round(Math.max(...lane.rpms) * 100) / 100,
          avg_gross: Math.round(lane.grosses.reduce((s, g) => s + g, 0) / lane.grosses.length),
          avg_miles: Math.round(lane.miles.reduce((s, m) => s + m, 0) / lane.miles.length),
          total_revenue: Math.round(lane.grosses.reduce((s, g) => s + g, 0)),
          equipment_breakdown: equipBreakdown,
          broker_breakdown: brokerBreakdown,
        }

        // Upsert
        await fetch(`${SUPABASE_URL}/rest/v1/lane_history`, {
          method: 'POST',
          headers: { ...sbHeaders('resolution=merge-duplicates,return=minimal'), 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify(row),
        })
      }

      // ── Compute predictions for all lanes this owner has ──
      const histRes = await fetch(
        `${SUPABASE_URL}/rest/v1/lane_history?owner_id=eq.${ownerId}&order=week_start.desc&limit=500&select=origin_state,dest_state,week_start,avg_rpm,load_count`,
        { headers: sbHeaders() }
      )
      if (!histRes.ok) continue
      const allHistory = await histRes.json()

      // Group by lane
      const laneGroups = {}
      for (const h of allHistory) {
        const lk = `${h.origin_state}|${h.dest_state}`
        if (!laneGroups[lk]) laneGroups[lk] = []
        laneGroups[lk].push(h)
      }

      for (const [lk, weeklyData] of Object.entries(laneGroups)) {
        const [originState, destState] = lk.split('|')
        const { trend, trend_pct, confidence } = detectTrend(weeklyData)
        const seasonMult = getSeasonMultiplier(originState)
        const currentRpm = parseFloat(weeklyData[0]?.avg_rpm) || 0
        const predictedRpm = Math.round(currentRpm * (1 + trend_pct / 100 * 0.5) * 100) / 100 // half-week projection

        await fetch(`${SUPABASE_URL}/rest/v1/lane_predictions`, {
          method: 'POST',
          headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            owner_id: ownerId,
            origin_state: originState,
            dest_state: destState,
            predicted_rpm: predictedRpm > 0 ? predictedRpm : currentRpm,
            trend, trend_pct, confidence,
            week_count: weeklyData.length,
            season_multiplier: seasonMult,
            computed_at: new Date().toISOString(),
          }),
        })
      }

      results.push({ owner_id: ownerId, loads_processed: loads.length, lanes: Object.keys(lanes).length })
    }

    return Response.json({
      success: true,
      owners_processed: ownerIds.length,
      results,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
