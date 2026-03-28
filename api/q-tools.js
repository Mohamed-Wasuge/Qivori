/**
 * POST /api/q-tools
 * Server-side tool execution for Q chatbot.
 * Executes real API calls and returns structured data.
 */
import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const EIA_KEY = process.env.EIA_API_KEY

function sbHeaders() {
  return { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

  try {
    const { tool, input } = await req.json()
    let result

    switch (tool) {
      case 'find_truck_stop':
        result = await findTruckStop(input.lat, input.lng, input.radius_miles || 25)
        break
      case 'find_roadside_service':
        result = await findRoadsideService(input.lat, input.lng, input.issue_type)
        break
      case 'get_fuel_prices':
        result = await getFuelPrices(input.lat, input.lng)
        break
      case 'check_weather':
        result = await checkWeather(input.lat, input.lng, input.location)
        break
      case 'get_load_status':
        result = await getLoadStatus(user.id, input.load_id)
        break
      case 'find_loads':
        result = await findLoads(user.id, input.origin, input.destination, input.equipment_type)
        break
      case 'web_search':
        result = await webSearch(input.query)
        break
      default:
        result = { error: `Unknown tool: ${tool}` }
    }

    return Response.json({ result }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}

// ── TOOL: Find Truck Stops (Overpass API — free, no key needed) ──────────────

async function findTruckStop(lat, lng, radiusMiles) {
  const radiusM = Math.round((radiusMiles || 25) * 1609.34)
  const query = `[out:json][timeout:10];(
    node["amenity"="fuel"]["hgv"="yes"](around:${radiusM},${lat},${lng});
    node["amenity"="fuel"]["name"~"Pilot|Flying J|Love|TA |Petro|Buckys|Sapp Bros|Ambest|Casey",i](around:${radiusM},${lat},${lng});
    node["highway"="rest_area"](around:${radiusM},${lat},${lng});
  );out body;`

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    })
    if (!res.ok) throw new Error('Overpass API failed')
    const data = await res.json()

    const stops = (data.elements || []).slice(0, 8).map(el => {
      const tags = el.tags || {}
      const dist = haversine(lat, lng, el.lat, el.lon)
      return {
        type: 'truck_stop',
        name: tags.name || tags.brand || 'Truck Stop',
        address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city'], tags['addr:state']].filter(Boolean).join(', ') || `${el.lat.toFixed(4)}, ${el.lon.toFixed(4)}`,
        phone: tags.phone || tags['contact:phone'] || null,
        miles_away: Math.round(dist * 10) / 10,
        lat: el.lat,
        lng: el.lon,
        brand: tags.brand || null,
        amenities: [
          tags.shower === 'yes' && 'Showers',
          tags.restaurant === 'yes' && 'Restaurant',
          tags['hgv:parking'] === 'yes' && 'Truck Parking',
          tags.shop === 'yes' && 'Shop',
        ].filter(Boolean),
      }
    })

    stops.sort((a, b) => a.miles_away - b.miles_away)
    return { stops: stops.slice(0, 5), count: stops.length }
  } catch {
    // Fallback: return Google Maps search link
    return {
      stops: [],
      fallback_url: `https://www.google.com/maps/search/truck+stop/@${lat},${lng},12z`,
      message: 'Search truck stops on Google Maps',
    }
  }
}

// ── TOOL: Find Roadside Service ──────────────────────────────────────────────

async function findRoadsideService(lat, lng, issueType) {
  const services = {
    tire: [
      { name: 'Love\'s Tire Care', phone: '1-800-388-0983', description: '24/7 tire service at Love\'s locations', national: true },
      { name: 'TA Truck Service', phone: '1-800-632-9240', description: '24/7 tire & roadside at TA/Petro', national: true },
      { name: 'Goodyear Fleet HQ', phone: '1-866-574-5529', description: '24/7 commercial tire service', national: true },
      { name: 'Michelin ONCall', phone: '1-800-847-3911', description: '24/7 emergency tire service', national: true },
    ],
    towing: [
      { name: 'United Road Towing', phone: '1-800-967-0058', description: 'Heavy-duty towing nationwide', national: true },
      { name: 'FleetNet America', phone: '1-800-438-8961', description: '24/7 breakdown & towing dispatch', national: true },
      { name: 'Truck Down', phone: '1-866-871-4273', description: 'Commercial towing network', national: true },
    ],
    fuel: [
      { name: 'Fuel Delivery Service', phone: '1-800-438-8961', description: 'FleetNet — mobile fueling', national: true },
      { name: 'Love\'s Roadside', phone: '1-800-388-0983', description: 'Fuel delivery + jump start', national: true },
    ],
    mechanical: [
      { name: 'FleetNet America', phone: '1-800-438-8961', description: '24/7 mobile repair dispatch', national: true },
      { name: 'Rush Truck Centers', phone: '1-866-965-7874', description: 'Nearest dealer for heavy repair', national: true },
      { name: 'Ryder Roadside', phone: '1-800-257-9337', description: '24/7 commercial vehicle repair', national: true },
      { name: 'Penske Roadside', phone: '1-800-526-0798', description: '24/7 roadside assistance', national: true },
    ],
  }

  const issueKey = (issueType || 'mechanical').toLowerCase()
  const providers = services[issueKey] || services.mechanical

  return {
    issue_type: issueKey,
    providers: providers.map(p => ({
      ...p,
      type: 'roadside_service',
      call_url: `tel:${p.phone.replace(/[^0-9+]/g, '')}`,
    })),
    location: { lat, lng },
    tip: issueKey === 'tire' ? 'Get the DOT number off the tire before calling — speeds up the dispatch.' :
         issueKey === 'towing' ? 'Have your USDOT# and exact mile marker ready.' :
         'Have your truck year, make, model, and VIN ready.',
  }
}

// ── TOOL: Get Fuel Prices (EIA API) ──────────────────────────────────────────

async function getFuelPrices(lat, lng) {
  // EIA weekly diesel prices by region
  try {
    const regionMap = getEIARegion(lat, lng)
    const res = await fetch(
      `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${EIA_KEY}&frequency=weekly&data[0]=value&facets[product][]=EPD2D&facets[duoarea][]=${regionMap.code}&sort[0][column]=period&sort[0][direction]=desc&length=1`,
    )
    if (res.ok) {
      const data = await res.json()
      const price = data?.response?.data?.[0]?.value
      if (price) {
        return {
          type: 'fuel_prices',
          region: regionMap.name,
          diesel_avg: parseFloat(price).toFixed(2),
          prices: [
            { station: `${regionMap.name} Average`, price: `$${parseFloat(price).toFixed(2)}`, type: 'regional_avg' },
            { station: 'Pilot/Flying J (typical)', price: `$${(parseFloat(price) - 0.05).toFixed(2)}`, type: 'estimate', note: 'Loyalty discount ~$0.05' },
            { station: 'Love\'s (typical)', price: `$${(parseFloat(price) - 0.03).toFixed(2)}`, type: 'estimate', note: 'Loyalty discount ~$0.03' },
          ],
          tip: 'Use your fuel card loyalty program for best discounts. Pilot/Flying J and Love\'s typically 3-5¢ below retail.',
          maps_url: `https://www.google.com/maps/search/diesel+fuel/@${lat},${lng},12z`,
        }
      }
    }
  } catch {}

  return {
    type: 'fuel_prices',
    prices: [],
    maps_url: `https://www.google.com/maps/search/diesel+fuel/@${lat},${lng},12z`,
    message: 'Tap to find diesel prices near you',
  }
}

function getEIARegion(lat, lng) {
  // Rough US region mapping
  if (lng < -100) {
    if (lat > 42) return { code: 'R40', name: 'Rocky Mountain' }
    return { code: 'R50', name: 'West Coast' }
  }
  if (lng < -85) {
    if (lat > 40) return { code: 'R20', name: 'Midwest' }
    return { code: 'R30', name: 'Gulf Coast' }
  }
  if (lat > 40) return { code: 'R1Y', name: 'East Coast (North)' }
  return { code: 'R1Z', name: 'East Coast (South)' }
}

// ── TOOL: Check Weather (Open-Meteo — free, no key) ─────────────────────────

async function checkWeather(lat, lng, location) {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code,precipitation&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,wind_speed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&forecast_days=3&timezone=auto`
    )
    if (!res.ok) throw new Error('Weather API failed')
    const data = await res.json()
    const cur = data.current || {}

    const weatherCodes = {
      0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Freezing fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
      61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Heavy freezing rain',
      71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
      80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
      85: 'Light snow showers', 86: 'Heavy snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Severe thunderstorm w/ hail',
    }

    const condition = weatherCodes[cur.weather_code] || 'Unknown'
    const alerts = []
    if (cur.wind_speed_10m > 40) alerts.push('HIGH WIND — consider pulling over')
    if (cur.wind_gusts_10m > 55) alerts.push('DANGEROUS GUSTS — park immediately')
    if ([66, 67].includes(cur.weather_code)) alerts.push('FREEZING RAIN — bridges and overpasses hazardous')
    if ([71, 73, 75, 85, 86].includes(cur.weather_code)) alerts.push('SNOW — reduce speed, increase following distance')
    if ([45, 48].includes(cur.weather_code)) alerts.push('FOG — use low beams, reduce speed')
    if ([95, 96, 99].includes(cur.weather_code)) alerts.push('THUNDERSTORM — seek shelter if severe')

    const daily = data.daily || {}
    const forecast = (daily.time || []).map((d, i) => ({
      date: d,
      high: daily.temperature_2m_max?.[i],
      low: daily.temperature_2m_min?.[i],
      condition: weatherCodes[daily.weather_code?.[i]] || '—',
      precip: daily.precipitation_sum?.[i] || 0,
      wind_max: daily.wind_speed_10m_max?.[i] || 0,
    }))

    return {
      type: 'weather',
      location: location || `${lat.toFixed(2)}, ${lng.toFixed(2)}`,
      current: {
        temp: Math.round(cur.temperature_2m),
        condition,
        humidity: cur.relative_humidity_2m,
        wind: Math.round(cur.wind_speed_10m),
        gusts: Math.round(cur.wind_gusts_10m || 0),
        precip: cur.precipitation || 0,
      },
      alerts,
      forecast,
    }
  } catch {
    return { type: 'weather', error: 'Weather data unavailable', location: location || '' }
  }
}

// ── TOOL: Get Load Status ────────────────────────────────────────────────────

async function getLoadStatus(ownerId, loadId) {
  if (!SUPABASE_URL || !SERVICE_KEY) return { error: 'Not configured' }

  let load = null
  for (const field of ['load_number', 'load_id', 'id']) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/loads?owner_id=eq.${ownerId}&${field}=eq.${encodeURIComponent(loadId)}&select=*,load_stops(*)&limit=1`,
      { headers: sbHeaders() }
    )
    if (res.ok) {
      const rows = await res.json()
      if (rows.length > 0) { load = rows[0]; break }
    }
  }

  if (!load) return { error: 'Load not found' }

  return {
    type: 'load_status',
    load_number: load.load_number || load.load_id,
    status: load.status,
    origin: load.origin,
    destination: load.destination,
    rate: parseFloat(load.rate) || 0,
    miles: load.miles || null,
    broker: load.broker_name || null,
    broker_phone: load.broker_phone || null,
    broker_email: load.broker_email || null,
    driver: load.carrier_name || null,
    equipment: load.equipment || 'Dry Van',
    pickup_date: load.pickup_date,
    delivery_date: load.delivery_date,
    stops: (load.load_stops || []).map(s => ({
      seq: s.sequence, type: s.type, city: s.city, state: s.state, status: s.status,
    })),
    next_action: getNextAction(load.status),
  }
}

function getNextAction(status) {
  const actions = {
    'Rate Con Received': 'Assign driver and dispatch',
    'Assigned to Driver': 'Dispatch the load',
    'Dispatched': 'Head to pickup',
    'At Pickup': 'Get loaded and upload BOL',
    'In Transit': 'Continue to delivery',
    'At Delivery': 'Deliver and get POD signed',
    'Delivered': 'Send invoice to broker',
    'Invoiced': 'Follow up on payment',
  }
  return actions[status] || 'Check load details'
}

// ── TOOL: Find Loads (from Supabase + market data) ───────────────────────────

async function findLoads(ownerId, origin, destination, equipmentType) {
  // Search available loads from load board or Supabase
  const loads = []

  if (SUPABASE_URL && SERVICE_KEY) {
    let query = `${SUPABASE_URL}/rest/v1/loads?status=eq.Rate Con Received&select=*&order=created_at.desc&limit=10`
    const res = await fetch(query, { headers: sbHeaders() })
    if (res.ok) {
      const rows = await res.json()
      for (const l of rows) {
        const matchOrigin = !origin || (l.origin || '').toLowerCase().includes(origin.toLowerCase())
        const matchDest = !destination || (l.destination || '').toLowerCase().includes(destination.toLowerCase())
        const matchEquip = !equipmentType || (l.equipment || '').toLowerCase().includes(equipmentType.toLowerCase())
        if (matchOrigin && matchDest && matchEquip) {
          loads.push({
            type: 'load_card',
            load_number: l.load_number || l.load_id,
            origin: l.origin,
            destination: l.destination,
            rate: parseFloat(l.rate) || 0,
            miles: l.miles || null,
            rpm: l.miles > 0 ? Math.round(parseFloat(l.rate) / l.miles * 100) / 100 : null,
            broker: l.broker_name || '—',
            equipment: l.equipment || 'Dry Van',
            pickup_date: l.pickup_date,
          })
        }
      }
    }
  }

  return {
    type: 'load_results',
    loads: loads.slice(0, 5),
    count: loads.length,
    search: { origin, destination, equipment: equipmentType },
    message: loads.length === 0 ? 'No loads matching that search right now.' : null,
  }
}

// ── TOOL: Web Search (DuckDuckGo Instant Answer — free, no key) ──────────────

async function webSearch(query) {
  try {
    // DuckDuckGo Instant Answer API (free, no key)
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    )
    if (res.ok) {
      const data = await res.json()
      const results = []

      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          snippet: data.AbstractText.slice(0, 300),
          url: data.AbstractURL || null,
          source: data.AbstractSource || 'Web',
        })
      }

      for (const topic of (data.RelatedTopics || []).slice(0, 3)) {
        if (topic.Text) {
          results.push({
            title: topic.Text?.split(' - ')[0]?.slice(0, 80) || '',
            snippet: topic.Text?.slice(0, 200) || '',
            url: topic.FirstURL || null,
            source: 'DuckDuckGo',
          })
        }
      }

      if (results.length > 0) {
        return { type: 'web_results', query, results }
      }
    }
  } catch {}

  // Fallback: return search link
  return {
    type: 'web_results',
    query,
    results: [{
      title: `Search: ${query}`,
      snippet: 'Tap to search the web',
      url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      source: 'Web Search',
    }],
  }
}

// ── Haversine distance (miles) ───────────────────────────────────────────────

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
