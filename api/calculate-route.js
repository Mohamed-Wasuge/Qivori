/**
 * Google Maps Route Calculator
 * Returns miles, duration, fuel cost (real EIA diesel), and toll estimate
 * Runtime: Vercel Edge
 */

export const config = { runtime: 'edge' }

export default async function handler(req) {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'Google Maps API key not configured' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  try {
    const { origin, destination, stops, mpg } = await req.json()

    if (!origin || !destination) {
      return Response.json({ error: 'Origin and destination required' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } })
    }

    const truckMpg = parseFloat(mpg) || 6.5

    // Build waypoints for multi-stop
    const waypoints = stops?.length ? `&waypoints=${stops.map(s => encodeURIComponent(s)).join('|')}` : ''

    // Two Directions API calls: one normal, one avoiding tolls — to estimate toll cost
    const dirNormalUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints}&units=imperial&key=${apiKey}`
    const dirNoTollUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints}&units=imperial&avoid=tolls&key=${apiKey}`

    // Geocode both endpoints + fetch diesel price in parallel
    const geoOriginUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(origin)}&key=${apiKey}`
    const geoDestUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${apiKey}`

    const reqOrigin = new URL(req.url).origin
    const dieselUrl = `${reqOrigin}/api/diesel-prices`

    const [dirNormalRes, dirNoTollRes, geoOriginRes, geoDestRes, dieselRes] = await Promise.all([
      fetch(dirNormalUrl),
      fetch(dirNoTollUrl),
      fetch(geoOriginUrl),
      fetch(geoDestUrl),
      fetch(dieselUrl).catch(() => null),
    ])

    const [dirNormal, dirNoToll, geoOriginData, geoDestData] = await Promise.all([
      dirNormalRes.json(),
      dirNoTollRes.json(),
      geoOriginRes.json(),
      geoDestRes.json(),
    ])

    let dieselPrice = 3.89 // fallback
    try {
      if (dieselRes?.ok) {
        const dieselData = await dieselRes.json()
        dieselPrice = dieselData?.national || dieselData?.prices?.national || dieselData?.average || 3.89
      }
    } catch {}

    // Extract route info from normal directions
    let miles = 0
    let durationMinutes = 0
    let durationText = ''
    let hasTolls = false

    if (dirNormal.routes?.[0]) {
      const legs = dirNormal.routes[0].legs || []
      miles = Math.round(legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0) / 1609.34)
      durationMinutes = Math.round(legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0) / 60)
      const hrs = Math.floor(durationMinutes / 60)
      const mins = durationMinutes % 60
      durationText = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`

      // Check if route has tolls by looking at warnings or comparing distances
      const summary = (dirNormal.routes[0].summary || '').toLowerCase()
      hasTolls = legs.some(leg =>
        leg.steps?.some(step =>
          (step.html_instructions || '').toLowerCase().includes('toll') ||
          (step.maneuver || '').includes('toll')
        )
      ) || summary.includes('toll') || summary.includes('turnpike') || summary.includes('thruway')
    }

    // Estimate toll cost by comparing toll vs no-toll route
    let tollEstimate = 0
    let noTollMiles = 0
    if (dirNoToll.routes?.[0]) {
      const noTollLegs = dirNoToll.routes[0].legs || []
      noTollMiles = Math.round(noTollLegs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0) / 1609.34)
    }

    // If avoiding tolls adds significant distance, there are likely tolls
    // Estimate toll cost: roughly $0.15-0.25/mile for toll portions in a truck
    if (noTollMiles > miles && (noTollMiles - miles) > 5) {
      hasTolls = true
      // The extra miles needed to avoid tolls indicates toll road distance
      const tollMilesEstimate = noTollMiles - miles
      // Average truck toll rate: ~$0.20/mile on toll roads
      tollEstimate = Math.round(tollMilesEstimate * 0.20 * 100) / 100
    } else if (hasTolls) {
      // Route mentions tolls but avoiding doesn't add much distance — estimate conservatively
      tollEstimate = Math.round(miles * 0.02 * 100) / 100 // ~2 cents/mile baseline
    }

    // Known toll corridor estimates (major trucking routes)
    const originLower = origin.toLowerCase()
    const destLower = destination.toLowerCase()
    const routeStr = `${originLower} ${destLower}`
    // Boost toll estimate for known high-toll corridors
    if (routeStr.includes('new york') || routeStr.includes('new jersey') || routeStr.includes('pennsylvania')) {
      tollEstimate = Math.max(tollEstimate, Math.round(miles * 0.06))
    }
    if (routeStr.includes('ohio') && routeStr.includes('turnpike')) {
      tollEstimate = Math.max(tollEstimate, Math.round(miles * 0.08))
    }
    if (routeStr.includes('chicago') || routeStr.includes('illinois')) {
      tollEstimate = Math.max(tollEstimate, Math.round(miles * 0.03))
    }

    // Calculate fuel cost
    const gallonsNeeded = miles / truckMpg
    const fuelCost = Math.round(gallonsNeeded * dieselPrice)

    // Extract coordinates
    const originCoords = geoOriginData.results?.[0]?.geometry?.location || null
    const destCoords = geoDestData.results?.[0]?.geometry?.location || null

    // Estimate driving days (11hrs driving per day per HOS)
    const drivingDays = Math.ceil(durationMinutes / (11 * 60))

    return Response.json({
      ok: true,
      miles,
      durationMinutes,
      durationText,
      drivingDays,
      fuel: {
        gallons: Math.round(gallonsNeeded * 10) / 10,
        dieselPrice: Math.round(dieselPrice * 100) / 100,
        cost: fuelCost,
        mpg: truckMpg,
      },
      tolls: {
        hasTolls,
        estimate: Math.round(tollEstimate),
        noTollMiles,
      },
      totalTripCost: fuelCost + Math.round(tollEstimate),
      origin: {
        formatted: geoOriginData.results?.[0]?.formatted_address || origin,
        lat: originCoords?.lat || null,
        lng: originCoords?.lng || null,
      },
      destination: {
        formatted: geoDestData.results?.[0]?.formatted_address || destination,
        lat: destCoords?.lat || null,
        lng: destCoords?.lng || null,
      },
    }, { headers: { 'Access-Control-Allow-Origin': '*' } })

  } catch (err) {
    console.error('Route calc error:', err)
    return Response.json({ error: err.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } })
  }
}
