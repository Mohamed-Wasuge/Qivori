/**
 * Weather Safety API — fetches NWS (National Weather Service) alerts & forecasts
 * Free, no API key needed — US government public data
 *
 * GET /api/weather-safety?lat=36.17&lng=-115.14  → current weather + alerts
 * GET /api/weather-safety?route=36.17,-115.14|34.05,-118.24  → weather along route
 */

export const config = { runtime: 'edge' }

const NWS_BASE = 'https://api.weather.gov'
const HEADERS = {
  'User-Agent': '(Qivori AI TMS, admin@qivori.com)',
  'Accept': 'application/geo+json',
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  const url = new URL(req.url)
  const lat = url.searchParams.get('lat')
  const lng = url.searchParams.get('lng')
  const route = url.searchParams.get('route')

  try {
    // Route mode — check weather at multiple points
    if (route) {
      const points = route.split('|').map(p => {
        const [la, ln] = p.split(',')
        return { lat: parseFloat(la), lng: parseFloat(ln) }
      }).filter(p => !isNaN(p.lat) && !isNaN(p.lng))

      if (points.length === 0) {
        return json({ error: 'Invalid route format. Use: lat,lng|lat,lng' }, 400)
      }

      // Generate intermediate points along route
      const checkPoints = interpolateRoute(points, 5) // check every ~5 points along route
      const results = await Promise.all(checkPoints.map(p => getWeatherAtPoint(p.lat, p.lng)))

      // Find worst conditions
      const alerts = results.flatMap(r => r.alerts || [])
      const worstCondition = results.reduce((worst, r) => {
        return (r.riskScore || 0) > (worst.riskScore || 0) ? r : worst
      }, results[0] || {})

      return json({
        routeWeather: results,
        alerts,
        worstCondition,
        overallRisk: Math.max(...results.map(r => r.riskScore || 0)),
        checkPoints: checkPoints.length,
      })
    }

    // Single point mode
    if (!lat || !lng) {
      return json({ error: 'Provide lat & lng, or route=lat,lng|lat,lng' }, 400)
    }

    const weather = await getWeatherAtPoint(parseFloat(lat), parseFloat(lng))
    return json(weather)

  } catch (err) {
    console.error('[weather-safety]', err.message)
    return json({ error: 'Weather service unavailable', detail: err.message }, 502)
  }
}

async function getWeatherAtPoint(lat, lng) {
  // Step 1: Get grid point from coordinates
  const pointRes = await fetch(`${NWS_BASE}/points/${lat.toFixed(4)},${lng.toFixed(4)}`, { headers: HEADERS })
  if (!pointRes.ok) {
    return { lat, lng, error: 'Point lookup failed', riskScore: 0 }
  }
  const pointData = await pointRes.json()
  const forecastUrl = pointData.properties?.forecast
  const alertZone = pointData.properties?.forecastZone

  // Step 2: Get forecast + active alerts in parallel
  const [forecastRes, alertsRes] = await Promise.all([
    forecastUrl ? fetch(forecastUrl, { headers: HEADERS }) : null,
    fetch(`${NWS_BASE}/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`, { headers: HEADERS }),
  ])

  let forecast = null
  if (forecastRes?.ok) {
    const fData = await forecastRes.json()
    const period = fData.properties?.periods?.[0]
    if (period) {
      forecast = {
        shortForecast: period.shortForecast,
        temperature: period.temperature,
        temperatureUnit: period.temperatureUnit,
        windSpeed: period.windSpeed,
        windDirection: period.windDirection,
        isDaytime: period.isDaytime,
        detailedForecast: period.detailedForecast,
      }
    }
  }

  let alerts = []
  if (alertsRes?.ok) {
    const aData = await alertsRes.json()
    alerts = (aData.features || []).map(f => ({
      event: f.properties.event,
      severity: f.properties.severity,
      urgency: f.properties.urgency,
      headline: f.properties.headline,
      description: f.properties.description?.slice(0, 300),
      expires: f.properties.expires,
    }))
  }

  // Calculate risk score for this point
  const riskScore = calculateWeatherRisk(forecast, alerts)

  return {
    lat,
    lng,
    location: pointData.properties?.relativeLocation?.properties?.city
      ? `${pointData.properties.relativeLocation.properties.city}, ${pointData.properties.relativeLocation.properties.state}`
      : `${lat.toFixed(2)}, ${lng.toFixed(2)}`,
    forecast,
    alerts,
    riskScore,
    riskLevel: riskScore >= 70 ? 'SEVERE' : riskScore >= 40 ? 'MODERATE' : riskScore >= 15 ? 'LOW' : 'CLEAR',
  }
}

function calculateWeatherRisk(forecast, alerts) {
  let risk = 0

  // Alerts are the strongest signal
  for (const alert of alerts) {
    if (alert.severity === 'Extreme') risk += 50
    else if (alert.severity === 'Severe') risk += 35
    else if (alert.severity === 'Moderate') risk += 20
    else risk += 10
  }

  if (forecast) {
    const condition = (forecast.shortForecast || '').toLowerCase()
    if (/tornado|hurricane|blizzard|ice storm/i.test(condition)) risk += 40
    else if (/snow|freezing|ice|sleet/i.test(condition)) risk += 25
    else if (/thunderstorm|heavy rain/i.test(condition)) risk += 20
    else if (/rain|fog|mist/i.test(condition)) risk += 10

    // Wind
    const wind = parseInt(forecast.windSpeed) || 0
    if (wind >= 40) risk += 20
    else if (wind >= 25) risk += 10

    // Temperature extremes
    if (forecast.temperature <= 15) risk += 15
    else if (forecast.temperature >= 110) risk += 10
  }

  return Math.min(risk, 100)
}

function interpolateRoute(points, maxPoints) {
  if (points.length >= maxPoints) return points.slice(0, maxPoints)
  if (points.length < 2) return points

  const result = [points[0]]
  const totalSegments = maxPoints - 1
  const totalDist = points.reduce((sum, p, i) => {
    if (i === 0) return 0
    return sum + Math.hypot(p.lat - points[i-1].lat, p.lng - points[i-1].lng)
  }, 0)

  for (let i = 1; i < totalSegments; i++) {
    const t = i / totalSegments
    const targetDist = t * totalDist
    let accDist = 0
    for (let j = 1; j < points.length; j++) {
      const segDist = Math.hypot(points[j].lat - points[j-1].lat, points[j].lng - points[j-1].lng)
      if (accDist + segDist >= targetDist) {
        const segT = (targetDist - accDist) / segDist
        result.push({
          lat: points[j-1].lat + segT * (points[j].lat - points[j-1].lat),
          lng: points[j-1].lng + segT * (points[j].lng - points[j-1].lng),
        })
        break
      }
      accDist += segDist
    }
  }

  result.push(points[points.length - 1])
  return result
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  })
}
