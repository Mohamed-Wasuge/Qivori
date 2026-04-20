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
 * POST /api/fuel-savings-check
 * Compare a fuel purchase against retail avg for that state.
 * Body: { price_per_gallon, gallons, state, load_id, station_name }
 * Returns: { saved_on_fill, retail_avg, cheaper_nearby, ytd_savings }
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
    const { price_per_gallon, gallons, state, load_id, station_name } = await req.json()
    const userId = req._user.id
    const pricePaid = parseFloat(price_per_gallon) || 0
    const gals = parseFloat(gallons) || 0

    if (!pricePaid || !gals) {
      return Response.json({ error: 'price_per_gallon and gallons are required' }, { status: 400, headers: corsHeaders(req) })
    }

    // State-level retail diesel averages (EIA data approximations)
    const STATE_AVG = {
      TX: 3.54, CA: 4.82, FL: 3.61, GA: 3.48, TN: 3.52, AL: 3.49,
      MS: 3.45, LA: 3.51, AR: 3.50, OK: 3.47, KS: 3.55, MO: 3.53,
      IL: 3.89, IN: 3.62, OH: 3.68, PA: 3.91, NY: 4.12, NC: 3.59,
      SC: 3.55, VA: 3.71, WV: 3.74, KY: 3.57, MI: 3.75, WI: 3.72,
      MN: 3.69, IA: 3.64, NE: 3.61, SD: 3.66, ND: 3.58, MT: 3.74,
      WY: 3.62, CO: 3.81, NM: 3.63, AZ: 3.79, NV: 4.21, UT: 3.76,
      ID: 3.83, OR: 4.31, WA: 4.45, DEFAULT: 3.75,
    }

    const retailAvg = STATE_AVG[state?.toUpperCase()] || STATE_AVG.DEFAULT
    const savedPerGallon = retailAvg - pricePaid
    const savedOnFill = Math.round(savedPerGallon * gals * 100) / 100

    // Get YTD savings from expenses table
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString()
    const expRes = await fetch(
      `${SUPABASE_URL}/rest/v1/expenses?user_id=eq.${userId}&category=eq.fuel&created_at=gte.${yearStart}&select=fuel_savings`,
      { headers: sbH() }
    )
    const expenses = expRes.ok ? await expRes.json() : []
    const ytdSavings = expenses.reduce((s, e) => s + Number(e.fuel_savings || 0), 0) + Math.max(0, savedOnFill)

    // Find cheaper station nearby (stub — real impl would query GasBuddy/OPIS API)
    const cheaperNearby = savedOnFill < 0 ? {
      name: 'Loves #189',
      distance_mi: 12,
      price: Math.round((pricePaid - 0.06) * 100) / 100,
      would_have_saved: Math.round(0.06 * gals * 100) / 100,
    } : null

    return Response.json({
      price_paid: pricePaid,
      retail_avg: retailAvg,
      saved_per_gallon: Math.round(savedPerGallon * 100) / 100,
      saved_on_fill: savedOnFill,
      ytd_savings: Math.round(ytdSavings * 100) / 100,
      cheaper_nearby: cheaperNearby,
      state: state?.toUpperCase(),
    }, { headers: corsHeaders(req) })

  } catch (err) {
    console.error('[fuel-savings-check]', err.message)
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
