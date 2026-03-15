import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

// EIA series IDs for weekly retail diesel prices by region
const EIA_SERIES = [
  { region: 'US AVG', seriesId: 'PET.EMD_EPD2D_PTE_NUS_DPG.W' },
  { region: 'EAST COAST', seriesId: 'PET.EMD_EPD2D_PTE_R10_DPG.W' },
  { region: 'MIDWEST', seriesId: 'PET.EMD_EPD2D_PTE_R20_DPG.W' },
  { region: 'GULF COAST', seriesId: 'PET.EMD_EPD2D_PTE_R30_DPG.W' },
  { region: 'ROCKY MTN', seriesId: 'PET.EMD_EPD2D_PTE_R40_DPG.W' },
  { region: 'WEST COAST', seriesId: 'PET.EMD_EPD2D_PTE_R50_DPG.W' },
]

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'GET') {
    return Response.json({ error: 'GET only' }, { status: 405, headers: corsHeaders(req) })
  }

  // No auth required — diesel prices are public data
  const ip = getClientIP(req)
  const { limited, resetMs } = rateLimit(`diesel:${ip}`, 30, 60000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  const eiaApiKey = process.env.EIA_API_KEY

  try {
    // 1. Try to get cached prices from Supabase (less than 18 hours old)
    if (supabaseUrl && supabaseServiceKey) {
      const cached = await getCachedPrices(supabaseUrl, supabaseServiceKey)
      if (cached && cached.length > 0) {
        return Response.json({ prices: cached, source: 'cache' }, {
          headers: { ...corsHeaders(req), 'Cache-Control': 'public, max-age=3600' }
        })
      }
    }

    // 2. Fetch fresh data from EIA API
    if (!eiaApiKey) {
      return Response.json({ prices: getFallbackPrices(), source: 'fallback' }, {
        headers: corsHeaders(req)
      })
    }

    const prices = await fetchEIAPrices(eiaApiKey)

    // 3. Cache in Supabase
    if (supabaseUrl && supabaseServiceKey && prices.length > 0) {
      await cachePrices(supabaseUrl, supabaseServiceKey, prices)
    }

    return Response.json({ prices, source: 'eia' }, {
      headers: { ...corsHeaders(req), 'Cache-Control': 'public, max-age=3600' }
    })
  } catch (err) {
    // If EIA fails, try cache even if stale
    if (supabaseUrl && supabaseServiceKey) {
      const stale = await getCachedPrices(supabaseUrl, supabaseServiceKey, true)
      if (stale && stale.length > 0) {
        return Response.json({ prices: stale, source: 'stale-cache' }, {
          headers: corsHeaders(req)
        })
      }
    }
    return Response.json({ prices: getFallbackPrices(), source: 'fallback' }, {
      headers: corsHeaders(req)
    })
  }
}

async function fetchEIAPrices(apiKey) {
  const prices = []

  // EIA API v2 — fetch all series in parallel
  const fetches = EIA_SERIES.map(async ({ region, seriesId }) => {
    try {
      const url = `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${apiKey}&frequency=weekly&data[0]=value&facets[series][]=${seriesId}&sort[0][column]=period&sort[0][direction]=desc&length=2`

      const res = await fetch(url)
      if (!res.ok) return null

      const data = await res.json()
      const rows = data?.response?.data
      if (!rows || rows.length === 0) return null

      const current = parseFloat(rows[0].value)
      const previous = rows.length > 1 ? parseFloat(rows[1].value) : current
      const change = +(current - previous).toFixed(3)

      return {
        region,
        price: current,
        previous,
        change,
        period: rows[0].period,
        seriesId,
      }
    } catch {
      return null
    }
  })

  const results = await Promise.all(fetches)
  for (const r of results) {
    if (r) prices.push(r)
  }

  return prices
}

async function getCachedPrices(supabaseUrl, serviceKey, allowStale = false) {
  try {
    // Get prices cached in last 18 hours (EIA updates weekly on Monday)
    const maxAge = allowStale ? '168' : '18' // 7 days if stale-ok, 18 hours otherwise
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

    // Group by most recent fetch batch
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
    // Delete old cache entries
    await fetch(`${supabaseUrl}/rest/v1/diesel_prices?id=neq.00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal',
      },
    })

    // Insert fresh data
    const rows = prices.map(p => ({
      region: p.region,
      price: p.price,
      previous_price: p.previous,
      price_change: p.change,
      period: p.period,
      series_id: p.seriesId,
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
    // Silent fail — next request will re-fetch
  }
}

function getFallbackPrices() {
  return EIA_SERIES.map(({ region }) => ({
    region,
    price: 0,
    previous: 0,
    change: 0,
    period: null,
  }))
}
