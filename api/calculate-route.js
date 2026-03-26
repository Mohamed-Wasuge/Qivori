/**
 * Google Maps Distance Matrix + Geocoding API
 * Returns driving distance (miles), duration, and coordinates for origin/destination
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
    const { origin, destination, stops } = await req.json()

    if (!origin || !destination) {
      return Response.json({ error: 'Origin and destination required' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } })
    }

    // Build waypoints string for multi-stop routes
    const waypoints = stops?.length ? `&waypoints=${stops.map(s => encodeURIComponent(s)).join('|')}` : ''

    // Distance Matrix API — driving distance + duration
    const dmUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&units=imperial&avoid=tolls&key=${apiKey}`

    // Directions API for multi-stop routes (if stops provided)
    const dirUrl = stops?.length
      ? `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints}&units=imperial&key=${apiKey}`
      : null

    // Geocode both endpoints in parallel
    const geoOriginUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(origin)}&key=${apiKey}`
    const geoDestUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${apiKey}`

    const fetches = [
      fetch(dirUrl || dmUrl),
      fetch(geoOriginUrl),
      fetch(geoDestUrl),
    ]

    const [routeRes, geoOriginRes, geoDestRes] = await Promise.all(fetches)
    const [routeData, geoOriginData, geoDestData] = await Promise.all([
      routeRes.json(), geoOriginRes.json(), geoDestRes.json(),
    ])

    // Extract distance and duration
    let miles = 0
    let durationMinutes = 0
    let durationText = ''

    if (dirUrl && routeData.routes?.[0]) {
      // Directions API response (multi-stop)
      const legs = routeData.routes[0].legs || []
      miles = Math.round(legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0) / 1609.34)
      durationMinutes = Math.round(legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0) / 60)
      const hrs = Math.floor(durationMinutes / 60)
      const mins = durationMinutes % 60
      durationText = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
    } else if (routeData.rows?.[0]?.elements?.[0]?.status === 'OK') {
      // Distance Matrix response (point-to-point)
      const el = routeData.rows[0].elements[0]
      miles = Math.round((el.distance?.value || 0) / 1609.34)
      durationMinutes = Math.round((el.duration?.value || 0) / 60)
      const hrs = Math.floor(durationMinutes / 60)
      const mins = durationMinutes % 60
      durationText = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
    }

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
