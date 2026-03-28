/**
 * POST /api/lane-predict — Get lane prediction + history
 * GET  /api/lane-predict?origin=TX&dest=GA — Same via query params
 *
 * Returns: predicted RPM, trend, confidence, 12-week history
 */
import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders() {
  return { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })

  try {
    let originState, destState
    if (req.method === 'POST') {
      const body = await req.json()
      originState = body.origin_state
      destState = body.dest_state
    } else {
      const url = new URL(req.url)
      originState = url.searchParams.get('origin')
      destState = url.searchParams.get('dest')
    }

    if (!originState || !destState) {
      return Response.json({ error: 'origin_state and dest_state required' }, { status: 400, headers: corsHeaders(req) })
    }

    originState = originState.toUpperCase().trim()
    destState = destState.toUpperCase().trim()

    // Fetch prediction
    const predRes = await fetch(
      `${SUPABASE_URL}/rest/v1/lane_predictions?owner_id=eq.${user.id}&origin_state=eq.${originState}&dest_state=eq.${destState}&limit=1`,
      { headers: sbHeaders() }
    )
    const pred = predRes.ok ? (await predRes.json())?.[0] : null

    // Fetch history (last 12 weeks)
    const histRes = await fetch(
      `${SUPABASE_URL}/rest/v1/lane_history?owner_id=eq.${user.id}&origin_state=eq.${originState}&dest_state=eq.${destState}&order=week_start.desc&limit=12&select=week_start,avg_rpm,min_rpm,max_rpm,load_count,avg_gross,avg_miles,total_revenue,equipment_breakdown,broker_breakdown`,
      { headers: sbHeaders() }
    )
    const history = histRes.ok ? await histRes.json() : []

    if (!pred && history.length === 0) {
      return Response.json({
        lane: `${originState} → ${destState}`,
        prediction: null,
        history: [],
        message: 'No historical data for this lane yet. Complete more loads on this lane to get predictions.',
      }, { headers: corsHeaders(req) })
    }

    // Find top brokers on this lane
    const brokerCounts = {}
    for (const h of history) {
      if (h.broker_breakdown) {
        for (const [broker, data] of Object.entries(h.broker_breakdown)) {
          if (!brokerCounts[broker]) brokerCounts[broker] = { count: 0, total_rpm: 0 }
          brokerCounts[broker].count += data.count || 0
          brokerCounts[broker].total_rpm += (data.avg_rpm || 0) * (data.count || 0)
        }
      }
    }
    const topBrokers = Object.entries(brokerCounts)
      .map(([name, d]) => ({ name, loads: d.count, avg_rpm: d.count > 0 ? Math.round(d.total_rpm / d.count * 100) / 100 : 0 }))
      .sort((a, b) => b.loads - a.loads)
      .slice(0, 5)

    return Response.json({
      lane: `${originState} → ${destState}`,
      prediction: pred ? {
        predicted_rpm: parseFloat(pred.predicted_rpm),
        trend: pred.trend,
        trend_pct: parseFloat(pred.trend_pct),
        confidence: pred.confidence,
        week_count: pred.week_count,
        season_multiplier: parseFloat(pred.season_multiplier),
        computed_at: pred.computed_at,
      } : null,
      history: history.map(h => ({
        week: h.week_start,
        avg_rpm: parseFloat(h.avg_rpm),
        min_rpm: parseFloat(h.min_rpm),
        max_rpm: parseFloat(h.max_rpm),
        loads: h.load_count,
        avg_gross: parseFloat(h.avg_gross),
        avg_miles: parseFloat(h.avg_miles),
        revenue: parseFloat(h.total_revenue),
      })),
      top_brokers: topBrokers,
      total_loads: history.reduce((s, h) => s + (h.load_count || 0), 0),
      total_revenue: history.reduce((s, h) => s + parseFloat(h.total_revenue || 0), 0),
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
