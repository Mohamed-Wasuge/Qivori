/**
 * /api/route-intel — Claude generates 3 freight route recommendations for the week
 *
 * POST body: { location: string, equipmentType?: string }
 * Returns:   { routes: RouteObject[], cached?: boolean }
 *
 * RouteObject: { name, origin, waypoints, destination,
 *               week_earnings, rpm, backhaul, available_loads,
 *               days, loads, summary }
 */

import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const FALLBACK_ROUTES = [
  {
    name: 'Nashville → Memphis → Dallas',
    origin: 'Nashville, TN', waypoints: ['Memphis, TN'], destination: 'Dallas, TX',
    week_earnings: 4850, rpm: 2.85, backhaul: 'Strong', available_loads: 14, days: 5,
    loads: [
      { from: 'Nashville, TN', to: 'Memphis, TN',   miles: 210, est_rate: 1200, status: 'active'    },
      { from: 'Memphis, TN',   to: 'Dallas, TX',     miles: 450, est_rate: 1850, status: 'queued'    },
      { from: 'Dallas, TX',    to: 'Houston, TX',    miles: 240, est_rate: 1800, status: 'searching' },
    ],
    summary: 'Strong freight corridor with excellent backhaul potential out of Dallas. High volume of chemical and automotive loads.',
  },
  {
    name: 'Chicago → Indianapolis → Atlanta',
    origin: 'Chicago, IL', waypoints: ['Indianapolis, IN'], destination: 'Atlanta, GA',
    week_earnings: 4420, rpm: 2.65, backhaul: 'Moderate', available_loads: 10, days: 5,
    loads: [
      { from: 'Chicago, IL',       to: 'Indianapolis, IN', miles: 180, est_rate: 1050, status: 'active'    },
      { from: 'Indianapolis, IN',  to: 'Atlanta, GA',       miles: 490, est_rate: 1980, status: 'queued'    },
      { from: 'Atlanta, GA',       to: 'Charlotte, NC',     miles: 245, est_rate: 1390, status: 'searching' },
    ],
    summary: 'Steady manufacturing freight south with good automotive backhauls from Atlanta metro.',
  },
  {
    name: 'Kansas City → Oklahoma City → Houston',
    origin: 'Kansas City, MO', waypoints: ['Oklahoma City, OK'], destination: 'Houston, TX',
    week_earnings: 4100, rpm: 2.55, backhaul: 'Moderate', available_loads: 8, days: 5,
    loads: [
      { from: 'Kansas City, MO',    to: 'Oklahoma City, OK', miles: 340, est_rate: 1450, status: 'active'    },
      { from: 'Oklahoma City, OK',  to: 'Houston, TX',        miles: 450, est_rate: 1650, status: 'queued'    },
      { from: 'Houston, TX',        to: 'San Antonio, TX',    miles: 200, est_rate: 1000, status: 'searching' },
    ],
    summary: 'Reliable energy-sector freight corridor. Oil field equipment and industrial loads run consistently.',
  },
]

export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_KEY) {
    return Response.json({ routes: FALLBACK_ROUTES, cached: true }, { headers: corsHeaders(req) })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const location = body.location || 'Midwest'
    const equipment = body.equipmentType || 'Dry Van'
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

    const prompt = `You are a senior freight route planner with deep knowledge of US trucking lanes.

Today is ${today}. Generate 3 route recommendations for a ${equipment} truck starting from ${location}.

Each route covers a full work week (Mon–Fri, 5 days). Consider:
- Current seasonal freight patterns for this time of year
- Backhaul availability at the destination
- Load density and broker competition on each lane
- Realistic rate-per-mile for dry van in current market

Return ONLY a valid JSON array of exactly 3 routes, ranked by total week earnings (highest first).

Schema for each route:
{
  "name": "City A → City B → City C",
  "origin": "City, ST",
  "waypoints": ["City, ST"],
  "destination": "City, ST",
  "week_earnings": 4850,
  "rpm": 2.85,
  "backhaul": "Strong",
  "available_loads": 12,
  "days": 5,
  "loads": [
    { "from": "City, ST", "to": "City, ST", "miles": 210, "est_rate": 1200, "status": "active" },
    { "from": "City, ST", "to": "City, ST", "miles": 450, "est_rate": 1850, "status": "queued" },
    { "from": "City, ST", "to": "City, ST", "miles": 240, "est_rate": 1800, "status": "searching" }
  ],
  "summary": "One sentence Q insight about why this route is good this week."
}

Rules:
- backhaul must be exactly "Strong", "Moderate", or "Weak"
- status values: first load = "active", second = "queued", third = "searching"
- week_earnings = sum of est_rate for all 3 loads
- rpm = week_earnings / total_miles (rounded to 2 decimal places)
- available_loads: realistic integer 5-20 for this lane
- Return ONLY the JSON array, no markdown, no explanation`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeRes.ok) {
      console.error('[route-intel] Claude error', claudeRes.status)
      return Response.json({ routes: FALLBACK_ROUTES, cached: true }, { headers: corsHeaders(req) })
    }

    const claudeData = await claudeRes.json()
    const raw = claudeData.content?.[0]?.text || ''

    let routes
    try {
      const jsonStr = raw.replace(/```(?:json)?\n?/g, '').replace(/```\n?/g, '').trim()
      routes = JSON.parse(jsonStr)
      if (!Array.isArray(routes) || routes.length === 0) throw new Error('Not an array')
    } catch (e) {
      console.error('[route-intel] parse error', e.message, raw.slice(0, 200))
      return Response.json({ routes: FALLBACK_ROUTES, cached: true }, { headers: corsHeaders(req) })
    }

    return Response.json({ routes: routes.slice(0, 3) }, { headers: corsHeaders(req) })

  } catch (err) {
    console.error('[route-intel] error:', err.message)
    return Response.json({ routes: FALLBACK_ROUTES, cached: true }, { headers: corsHeaders(req) })
  }
}
