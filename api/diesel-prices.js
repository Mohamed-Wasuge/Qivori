import { handleCors, corsHeaders } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

// PADD region codes for EIA API v2
const REGIONS = [
  { region: 'US AVG', duoarea: 'NUS' },
  { region: 'EAST COAST', duoarea: 'R10' },
  { region: 'MIDWEST', duoarea: 'R20' },
  { region: 'GULF COAST', duoarea: 'R30' },
  { region: 'ROCKY MTN', duoarea: 'R40' },
  { region: 'WEST COAST', duoarea: 'R50' },
]

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'GET') {
    return Response.json({ error: 'GET only' }, { status: 405, headers: corsHeaders(req) })
  }

  const ip = getClientIP(req)
  const { limited, resetMs } = rateLimit(`diesel:${ip}`, 30, 60000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  const eiaApiKey = process.env.EIA_API_KEY

  try {
    // 1. Try cached prices from Supabase
    if (supabaseUrl && supabaseServiceKey) {
      const cached = await getCachedPrices(supabaseUrl, supabaseServiceKey)
      if (cached && cached.length > 0) {
        return Response.json({ prices: cached, source: 'cache' }, {
          headers: { ...corsHeaders(req), 'Cache-Control': 'public, max-age=3600' }
        })
      }
    }

    // 2. Fetch from EIA
    if (!eiaApiKey) {
      return Response.json({ error: 'EIA_API_KEY not configured' }, {
        status: 500, headers: corsHeaders(req)
      })
    }

    const prices = await fetchEIAPrices(eiaApiKey)

    if (prices.length === 0) {
      return Response.json({ error: 'No data from EIA' }, {
        status: 502, headers: corsHeaders(req)
      })
    }

    // 3. Cache in Supabase
    if (supabaseUrl && supabaseServiceKey) {
      await cachePrices(supabaseUrl, supabaseServiceKey, prices)
    }

    return Response.json({ prices, source: 'eia' }, {
      headers: { ...corsHeaders(req), 'Cache-Control': 'public, max-age=3600' }
    })
  } catch (err) {
    // Try stale cache
    if (supabaseUrl && supabaseServiceKey) {
      const stale = await getCachedPrices(supabaseUrl, supabaseServiceKey, true)
      if (stale && stale.length > 0) {
        return Response.json({ prices: stale, source: 'stale-cache' }, {
          headers: corsHeaders(req)
        })
      }
    }
    return Response.json({ error: 'Failed to fetch diesel prices' }, {
      status: 502, headers: corsHeaders(req)
    })
  }
}

async function fetchEIAPrices(apiKey) {
  // Fetch each region individually to avoid bracket encoding issues
  const fetches = REGIONS.map(async ({ region, duoarea }) => {
    try {
      // Try EPD2D first (No. 2 Diesel, all types)
      let url = `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${encodeURIComponent(apiKey)}&frequency=weekly&data[0]=value&facets[product][]=EPD2D&facets[duoarea][]=${duoarea}&sort[0][column]=period&sort[0][direction]=desc&length=2`
      let res = await fetch(url)

      if (!res.ok) {
        // Fallback: EPD2DXL0 (Ultra Low Sulfur)
        url = `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${encodeURIComponent(apiKey)}&frequency=weekly&data[0]=value&facets[product][]=EPD2DXL0&facets[duoarea][]=${duoarea}&sort[0][column]=period&sort[0][direction]=desc&length=2`
        res = await fetch(url)
        if (!res.ok) return null
      }

      const data = await res.json()
      const rows = data?.response?.data
      if (!rows || rows.length === 0) return null

      const current = parseFloat(rows[0].value)
      const previous = rows.length > 1 ? parseFloat(rows[1].value) : current
      const change = +(current - previous).toFixed(3)

      return { region, price: current, previous, change, period: rows[0].period }
    } catch {
      return null
    }
  })

  const results = await Promise.all(fetches)
  return results.filter(Boolean)
}

async function getCachedPrices(supabaseUrl, serviceKey, allowStale = false) {
  try {
    const maxAge = allowStale ? '168' : '4'
    const cutoff = new Date(Date.now() - parseInt(maxAge) * 3600000).toISOString()

    const res = await fetch(
      `${supabaseUrl}/rest/v1/diesel_prices?fetched_at=gte.${cutoff}&order=fetched_at.desc&limit=6`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      }
    )

    if (!res.ok) return null
    const rows = await res.json()
    if (!rows || rows.length === 0) return null

    const latestFetch = rows[0].fetched_at
    const batch = rows.filter(r => r.fetched_at === latestFetch)

    return batch.map(r => ({
      region: r.region,
      price: parseFloat(r.price),
      previous: parseFloat(r.previous_price),
      change: parseFloat(r.price_change),
      period: r.period,
    }))
  } catch {
    return null
  }
}

async function cachePrices(supabaseUrl, serviceKey, prices) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/diesel_prices?id=neq.00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal',
      },
    })

    const rows = prices.map(p => ({
      region: p.region,
      price: p.price,
      previous_price: p.previous,
      price_change: p.change,
      period: p.period,
      series_id: p.region,
      fetched_at: new Date().toISOString(),
    }))

    await fetch(`${supabaseUrl}/rest/v1/diesel_prices`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(rows),
    })
  } catch {
    // Silent fail
  }
}
