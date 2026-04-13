/**
 * POST /api/q-route-recommend
 * Claude-powered route intelligence for solo OOs and fleet owners.
 * Returns 3 ranked route options with load estimates, earnings, and backhaul data.
 *
 * Body: { currentCity, currentState, hosRemaining, equipmentType, weeklyGoal, preferredDestination? }
 * Runtime: Edge
 */

import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL  = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY

async function sb(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  return r.ok ? r.json() : []
}

export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

  if (!ANTHROPIC_KEY) return Response.json({ error: 'Claude API not configured' }, { status: 500, headers: corsHeaders(req) })

  const body = await req.json().catch(() => ({}))
  const {
    currentCity = 'Unknown',
    currentState = 'US',
    hosRemaining = 11,
    equipmentType = 'Dry Van',
    weeklyGoal = 4000,
    preferredDestination = null,
  } = body

  // Pull driver's recent lanes for personalization
  let recentLanes = []
  try {
    const loads = await sb(
      `loads?owner_id=eq.${user.id}&status=in.(Delivered,delivered)&select=origin,destination,rate,miles&order=created_at.desc&limit=20`
    )
    if (Array.isArray(loads)) {
      recentLanes = loads.slice(0, 5).map(l => `${l.origin} → ${l.destination} ($${l.rate || 0})`)
    }
  } catch {}

  // Pull current diesel price for fuel cost context
  let dieselPrice = 4.00
  try {
    const diesel = await sb(`diesel_prices?region=eq.US AVG&order=fetched_at.desc&limit=1`)
    if (diesel[0]?.price) dieselPrice = parseFloat(diesel[0].price)
  } catch {}

  const fuelCpm = (dieselPrice / 6.5).toFixed(2) // ~6.5 mpg for semi

  const prompt = `You are Q, an AI freight dispatcher. A truck driver needs route recommendations.

DRIVER CONTEXT:
- Current location: ${currentCity}, ${currentState}
- HOS remaining today: ${hosRemaining} hours drive time
- Equipment: ${equipmentType}
- Weekly earnings goal: $${weeklyGoal}
- Current diesel: $${dieselPrice}/gal (~$${fuelCpm}/mile fuel cost)
- Recent lanes: ${recentLanes.length > 0 ? recentLanes.join(' | ') : 'First week, no history'}
${preferredDestination ? `- Preferred destination: ${preferredDestination}` : ''}

Generate exactly 3 route recommendations for this driver's week. Use your knowledge of real freight markets, seasonal demand, and load board patterns.

Return ONLY valid JSON — no markdown, no explanation:

{
  "routes": [
    {
      "name": "City A → City B → City C",
      "origin": "City A, ST",
      "waypoints": ["City B, ST"],
      "destination": "City C, ST",
      "week_earnings": 4850,
      "rpm": 2.85,
      "backhaul": "Strong",
      "available_loads": 14,
      "days": 5,
      "loads": [
        {"from": "City A, ST", "to": "City B, ST", "miles": 210, "est_rate": 1200, "status": "active"},
        {"from": "City B, ST", "to": "City C, ST", "miles": 450, "est_rate": 1850, "status": "queued"},
        {"from": "City C, ST", "to": "City D, ST", "miles": 240, "est_rate": 1800, "status": "searching"}
      ],
      "summary": "One sentence on why this route is strong right now."
    }
  ]
}

Rules:
- Route 1 is the BEST for highest earnings this week
- Route 2 is solid but safer/shorter
- Route 3 is a wildcard or home-direction option
- Use real US freight corridors and cities
- Estimate RPM between $2.20 and $3.50 — be realistic, not optimistic
- If HOS < 8h, keep routes shorter (no 600+ mile first loads)
- If weekly goal > $5000, recommend higher-demand corridors (produce lanes, automotive)
- Backhaul must be one of: "Strong", "Moderate", "Weak"
- week_earnings should be achievable (not fantasy numbers)
${preferredDestination ? `- At least one route should head toward ${preferredDestination}` : ''}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[q-route-recommend] Claude error', res.status, err)
      return Response.json({ error: 'Route analysis unavailable', routes: [] }, { status: 502, headers: corsHeaders(req) })
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''

    // Strip markdown if Claude wraps in ```
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)

    return Response.json({ routes: parsed.routes || [], source: 'claude' }, { headers: corsHeaders(req) })
  } catch (err) {
    console.error('[q-route-recommend]', err)
    return Response.json({ error: 'Failed to generate routes', routes: [] }, { status: 500, headers: corsHeaders(req) })
  }
}
