export const config = { runtime: 'edge' }

const CITY_COORDS = {
  'dallas': [32.78, -96.80], 'houston': [29.76, -95.37], 'chicago': [41.88, -87.63],
  'atlanta': [33.75, -84.39], 'los angeles': [34.05, -118.24], 'memphis': [35.15, -90.05],
  'indianapolis': [39.77, -86.16], 'nashville': [36.16, -86.78], 'columbus': [39.96, -82.99],
  'charlotte': [35.23, -80.84], 'jacksonville': [30.33, -81.66], 'detroit': [42.33, -83.05],
  'miami': [25.76, -80.19], 'phoenix': [33.45, -112.07], 'denver': [39.74, -104.99],
  'seattle': [47.61, -122.33], 'new york': [40.71, -74.01], 'philadelphia': [39.95, -75.17],
  'laredo': [27.51, -99.51], 'el paso': [31.76, -106.49],
}

const ACTIVE_STATUSES = ['En Route to Pickup', 'Loaded', 'In Transit', 'At Pickup', 'At Delivery']
const AVG_SPEED_MPH = 55
const METRO_SPEED_MPH = 35
const MILES_PER_DEGREE = 69

export default async function handler(req) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const svcKey = process.env.SUPABASE_SERVICE_KEY
  const isServiceKey = svcKey && req.headers.get('x-service-key') === svcKey
  if (!cronSecret || (authHeader !== `Bearer ${cronSecret}` && !isServiceKey)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Missing env' }, { status: 500 })
  }

  try {
    // Fetch loads with active statuses that have an assigned driver
    const loadsRes = await supaFetch(supabaseUrl, serviceKey, '/rest/v1/loads', {
      select: 'id,driver_id,status,origin,destination,miles,status_updated_at,owner_id',
      status: `in.(${ACTIVE_STATUSES.join(',')})`,
      'driver_id': 'not.is.null',
    })
    if (!loadsRes.ok) {
      return Response.json({ error: 'Failed to fetch loads' }, { status: 500 })
    }
    const loads = await loadsRes.json()

    let updated = 0
    for (const load of loads) {
      const sim = simulatePosition(load)
      const hos = simulateHOS(load)

      const patch = {
        current_lat: sim.lat,
        current_lng: sim.lng,
        current_speed: sim.speed,
        location_updated_at: new Date().toISOString(),
        driving_hours_remaining: hos.drivingRemaining,
        hos_status: hos.status,
      }
      if (hos.shiftStart) patch.shift_start = hos.shiftStart

      const patchRes = await supaFetch(supabaseUrl, serviceKey,
        `/rest/v1/drivers?id=eq.${load.driver_id}&owner_id=eq.${load.owner_id}`,
        null, 'PATCH', patch
      )
      if (patchRes.ok) updated++
    }

    return Response.json({ ok: true, driversUpdated: updated, loadsProcessed: loads.length })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// ── GPS Simulation ──

function cityToCoords(cityStr) {
  if (!cityStr) return null
  const lower = cityStr.toLowerCase()
  for (const [city, coords] of Object.entries(CITY_COORDS)) {
    if (lower.includes(city)) return { lat: coords[0], lng: coords[1] }
  }
  // Fallback: hash the string to generate deterministic coords within CONUS
  let hash = 0
  for (let i = 0; i < lower.length; i++) hash = ((hash << 5) - hash + lower.charCodeAt(i)) | 0
  const lat = 29 + (Math.abs(hash) % 1800) / 100 // 29-47
  const lng = -120 + (Math.abs(hash >> 8) % 4000) / 100 // -120 to -80
  return { lat, lng }
}

function simulatePosition(load) {
  const origin = cityToCoords(load.origin)
  const dest = cityToCoords(load.destination)
  if (!origin || !dest) return { lat: 39.5, lng: -98.35, speed: 0 }

  // Determine direction: going to pickup or delivery
  const headingToDelivery = ['Loaded', 'In Transit', 'At Delivery'].includes(load.status)
  const from = headingToDelivery ? origin : origin
  const to = headingToDelivery ? dest : origin

  // At-location statuses: park near the location
  if (load.status === 'At Pickup') {
    return { lat: origin.lat + jitter(), lng: origin.lng + jitter(), speed: 0 }
  }
  if (load.status === 'At Delivery') {
    return { lat: dest.lat + jitter(), lng: dest.lng + jitter(), speed: 0 }
  }

  // Calculate progress based on time elapsed
  const elapsed = load.status_updated_at
    ? (Date.now() - new Date(load.status_updated_at).getTime()) / 3600000 // hours
    : 1
  const distMiles = load.miles || haversineApprox(from, to)
  const estTravelHours = distMiles / AVG_SPEED_MPH
  const progress = Math.min(elapsed / Math.max(estTravelHours, 0.5), 0.99)

  // Interpolate
  const startPt = headingToDelivery ? origin : origin
  const endPt = headingToDelivery ? dest : origin
  const lat = startPt.lat + (endPt.lat - startPt.lat) * progress + jitter()
  const lng = startPt.lng + (endPt.lng - startPt.lng) * progress + jitter()

  // Speed: slower near endpoints (metro), faster in middle (highway)
  const nearEndpoint = progress < 0.05 || progress > 0.95
  const speed = nearEndpoint ? METRO_SPEED_MPH : AVG_SPEED_MPH + Math.floor(Math.random() * 10 - 5)

  return { lat: round(lat, 4), lng: round(lng, 4), speed }
}

function haversineApprox(a, b) {
  const dlat = Math.abs(a.lat - b.lat)
  const dlng = Math.abs(a.lng - b.lng)
  return Math.sqrt(dlat * dlat + dlng * dlng) * MILES_PER_DEGREE
}

function jitter() { return (Math.random() - 0.5) * 0.04 } // ±0.02 degrees
function round(n, d) { const f = 10 ** d; return Math.round(n * f) / f }

// ── HOS Simulation ──

function simulateHOS(load) {
  const statusTime = load.status_updated_at ? new Date(load.status_updated_at) : new Date()
  const elapsedHours = (Date.now() - statusTime.getTime()) / 3600000
  const isDriving = ['En Route to Pickup', 'In Transit', 'Loaded'].includes(load.status)

  // Simulate a shift that started when status changed (or earlier)
  const shiftStart = new Date(statusTime.getTime() - Math.random() * 3600000).toISOString()
  const drivingUsed = isDriving ? Math.min(elapsedHours * 0.85, 11) : 0 // 85% of elapsed = driving
  const drivingRemaining = round(Math.max(11 - drivingUsed, 0), 1)

  let status = 'off_duty'
  if (isDriving && drivingRemaining > 0) {
    // After 8 hours driving, simulate a 30-min break
    status = drivingUsed >= 8 && drivingUsed < 8.5 ? 'on_duty' : 'driving'
  } else if (['At Pickup', 'At Delivery'].includes(load.status)) {
    status = 'on_duty'
  }

  return { drivingRemaining, status, shiftStart }
}

// ── Supabase helper ──

async function supaFetch(url, key, path, params, method = 'GET', body = null) {
  const u = new URL(path, url)
  if (params) Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v))
  const opts = {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: method === 'PATCH' ? 'return=minimal' : undefined,
    },
  }
  if (body) opts.body = JSON.stringify(body)
  return fetch(u.toString(), opts)
}
