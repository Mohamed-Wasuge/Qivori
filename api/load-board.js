import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'
import { getUserCredentials } from './load-board-credentials.js'

export const config = { runtime: 'edge' }

// ── Per-user cache keyed by userId (survives across requests in same Edge instance)
const userCaches = new Map()
const CACHE_TTL = 15 * 60 * 1000 // 15 minutes

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'GET' && req.method !== 'POST') {
    return Response.json({ error: 'GET or POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Authenticate and get user
  const { user, error: authError } = await verifyAuth(req)
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const ip = getClientIP(req)
  const { limited, resetMs } = rateLimit(`loadboard:${ip}`, 20, 60000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  // Parse filters from query params (GET) or body (POST)
  let filters = {}
  if (req.method === 'POST') {
    try { filters = await req.json() } catch {}
  } else {
    const url = new URL(req.url)
    filters = {
      origin: url.searchParams.get('origin') || '',
      destination: url.searchParams.get('destination') || '',
      equipment: url.searchParams.get('equipment') || '',
      minRate: url.searchParams.get('minRate') || '',
      maxDeadhead: url.searchParams.get('maxDeadhead') || '',
    }
  }

  try {
    // Check per-user memory cache first
    const userCache = userCaches.get(user.id)
    if (userCache && Date.now() - userCache.time < CACHE_TTL) {
      const filtered = applyFilters(userCache.loads, filters)
      return Response.json({
        loads: filtered,
        total: filtered.length,
        source: 'cache',
        providers: userCache.providers || [],
      }, { headers: { ...corsHeaders(req), 'Cache-Control': 'private, max-age=300' } })
    }

    // Fetch THIS user's encrypted credentials from Supabase
    const userCreds = await getUserCredentials(user.id)

    // Also check platform env vars as fallback (for admin/testing)
    const hasDat = userCreds.dat || (process.env.DAT_CLIENT_ID && process.env.DAT_CLIENT_SECRET)
    const has123 = userCreds['123loadboard'] || process.env.LB123_API_KEY
    const hasTs = userCreds.truckstop || (process.env.TRUCKSTOP_CLIENT_ID && process.env.TRUCKSTOP_CLIENT_SECRET)

    if (!hasDat && !has123 && !hasTs) {
      return Response.json({
        loads: [],
        total: 0,
        source: 'none',
        providers: [],
        message: 'No load board connected. Go to Settings → Load Boards to connect your DAT, 123Loadboard, or Truckstop account.',
      }, { headers: corsHeaders(req) })
    }

    // Try providers using user's credentials (never mix between users)
    let loads = []
    const providers = []

    // 1. Try DAT API
    const datCreds = userCreds.dat || (process.env.DAT_CLIENT_ID ? { clientId: process.env.DAT_CLIENT_ID, clientSecret: process.env.DAT_CLIENT_SECRET } : null)
    if (datCreds) {
      const datLoads = await fetchDAT(filters, datCreds)
      if (datLoads.length > 0) {
        loads.push(...datLoads)
        providers.push('dat')
      }
    }

    // 2. Try 123Loadboard API
    const lb123Creds = userCreds['123loadboard'] || (process.env.LB123_CLIENT_ID ? {
      clientId: process.env.LB123_CLIENT_ID,
      clientSecret: process.env.LB123_CLIENT_SECRET,
      serviceUsername: process.env.LB123_SERVICE_USERNAME,
      servicePassword: process.env.LB123_SERVICE_PASSWORD,
    } : null)
    if (lb123Creds) {
      const lb123Loads = await fetch123Loadboard(filters, lb123Creds)
      if (lb123Loads.length > 0) {
        loads.push(...lb123Loads)
        providers.push('123loadboard')
      }
    }

    // 3. Try Truckstop.com API
    const tsCreds = userCreds.truckstop || (process.env.TRUCKSTOP_CLIENT_ID ? { clientId: process.env.TRUCKSTOP_CLIENT_ID, clientSecret: process.env.TRUCKSTOP_CLIENT_SECRET } : null)
    if (tsCreds) {
      const tsLoads = await fetchTruckstop(filters, tsCreds)
      if (tsLoads.length > 0) {
        loads.push(...tsLoads)
        providers.push('truckstop')
      }
    }

    // Deduplicate by origin+dest+rate+broker
    loads = deduplicateLoads(loads)

    // Score each load
    loads = loads.map(l => ({ ...l, aiScore: scoreLoad(l) }))
    loads.sort((a, b) => b.aiScore - a.aiScore)

    // Per-user cache
    userCaches.set(user.id, { loads, providers, time: Date.now() })
    // Evict old caches (keep max 50 users)
    if (userCaches.size > 50) {
      const oldest = [...userCaches.entries()].sort((a, b) => a[1].time - b[1].time)[0]
      if (oldest) userCaches.delete(oldest[0])
    }

    // Also cache to Supabase for persistence
    await cacheToSupabase(loads)

    const filtered = applyFilters(loads, filters)
    return Response.json({
      loads: filtered,
      total: filtered.length,
      source: providers.length > 0 ? providers.join('+') : 'none',
      providers,
    }, { headers: { ...corsHeaders(req), 'Cache-Control': 'private, max-age=300' } })
  } catch (err) {
    // Try Supabase cache as fallback
    const cached = await getSupabaseCache()
    if (cached && cached.length > 0) {
      const filtered = applyFilters(cached, filters)
      return Response.json({
        loads: filtered,
        total: filtered.length,
        source: 'stale-cache',
        providers: [],
      }, { headers: corsHeaders(req) })
    }
    return Response.json({ error: 'Load board unavailable', loads: [], total: 0 }, {
      status: 502, headers: corsHeaders(req)
    })
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DAT API Integration
// Requires: DAT_CLIENT_ID, DAT_CLIENT_SECRET env vars
// DAT uses OAuth2 client_credentials flow
// Docs: https://developer.dat.com
// ══════════════════════════════════════════════════════════════════════════════

// Per-user DAT token cache
const datTokenCache = new Map()

async function getDATToken(creds) {
  const { clientId, clientSecret } = creds || {}
  if (!clientId || !clientSecret) return null

  const cacheKey = clientId
  const cached = datTokenCache.get(cacheKey)
  if (cached && Date.now() < cached.expiry - 60000) return cached.token

  try {
    const res = await fetch('https://identity.api.dat.com/access/v1/token/client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    })
    if (!res.ok) return null
    const data = await res.json()
    datTokenCache.set(cacheKey, { token: data.accessToken, expiry: Date.now() + (data.expiresIn || 3600) * 1000 })
    return data.accessToken
  } catch {
    return null
  }
}

async function fetchDAT(filters, creds) {
  const token = await getDATToken(creds)
  if (!token) return []

  try {
    const body = {
      criteria: {
        lane: {},
        equipment: {},
      },
      paging: { first: 50 },
    }

    // Apply filters
    if (filters.origin) {
      body.criteria.lane.originCity = filters.origin
      body.criteria.lane.originStateProvince = filters.originState || undefined
    }
    if (filters.destination) {
      body.criteria.lane.destinationCity = filters.destination
      body.criteria.lane.destinationStateProvince = filters.destState || undefined
    }
    if (filters.equipment && filters.equipment !== 'All') {
      const equipMap = { 'Dry Van': 'V', 'Reefer': 'R', 'Flatbed': 'F' }
      body.criteria.equipment.type = equipMap[filters.equipment] || 'V'
    }

    const res = await fetch('https://freight.api.dat.com/posting/v2/loads/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) return []
    const data = await res.json()
    return (data.matches || []).map(normalizeDATLoad)
  } catch {
    return []
  }
}

function normalizeDATLoad(match) {
  const p = match.posting || match
  const origin = p.origin || p.lane?.origin || {}
  const dest = p.destination || p.lane?.destination || {}
  const rate = p.rateInfo || {}
  const equip = p.equipment || {}

  const miles = p.tripLength?.miles || p.miles || 0
  const gross = rate.rateUsd || rate.lineHaulRate || 0
  const rpm = miles > 0 ? +(gross / miles).toFixed(2) : 0

  return {
    id: `DAT-${p.matchId || p.postingId || Math.random().toString(36).slice(2, 8)}`,
    source: 'dat',
    broker: p.posterInfo?.companyName || p.companyName || 'Unknown',
    brokerMC: p.posterInfo?.mcNumber || '',
    origin: `${origin.city || ''}, ${origin.stateProv || ''}`.trim().replace(/^,\s*/, ''),
    originCity: origin.city || '',
    originState: origin.stateProv || '',
    dest: `${dest.city || ''}, ${dest.stateProv || ''}`.trim().replace(/^,\s*/, ''),
    destCity: dest.city || '',
    destState: dest.stateProv || '',
    miles,
    rate: rpm,
    gross,
    weight: p.weight?.pounds ? `${p.weight.pounds.toLocaleString()} lbs` : '',
    commodity: p.commodity?.description || p.comments || '',
    equipment: normalizeEquipment(equip.type || equip.category || ''),
    pickup: p.availability?.earliest || p.pickupDate || '',
    delivery: p.delivery?.latest || p.deliveryDate || '',
    deadhead: p.deadheadMiles || 0,
    refNum: p.referenceId || '',
    postedAt: p.createDate || new Date().toISOString(),
    laneKey: `${(origin.city || '').slice(0, 3).toUpperCase()}→${(dest.city || '').slice(0, 3).toUpperCase()}`,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 123Loadboard API Integration
// OAuth2 + POST /loads/search
// Docs: https://developers.123loadboard.com
// ══════════════════════════════════════════════════════════════════════════════

// Token cache (in-memory, shared across requests on same Edge instance)
let lb123Token = null
let lb123TokenExpiry = 0

async function get123Token(creds) {
  // Return cached token if still valid (with 60s buffer)
  if (lb123Token && Date.now() < lb123TokenExpiry - 60000) return lb123Token

  const basicAuth = btoa(`${creds.serviceUsername}:${creds.servicePassword}`)

  const res = await fetch('https://api.dev.123loadboard.com/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      '123LB-Api-Version': '1.3',
      'User-Agent': 'Qivori-Dispatch/1.0 (support@qivori.com)',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      username: creds.serviceUsername,
      password: creds.servicePassword,
    }).toString(),
  })

  if (!res.ok) {
    // Try client_credentials grant as fallback
    const res2 = await fetch('https://api.dev.123loadboard.com/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        '123LB-Api-Version': '1.3',
        'User-Agent': 'Qivori-Dispatch/1.0 (support@qivori.com)',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }).toString(),
    })
    if (!res2.ok) return null
    const data2 = await res2.json()
    lb123Token = data2.access_token
    lb123TokenExpiry = Date.now() + (data2.expires_in || 3600) * 1000
    return lb123Token
  }

  const data = await res.json()
  lb123Token = data.access_token
  lb123TokenExpiry = Date.now() + (data.expires_in || 3600) * 1000
  return lb123Token
}

async function fetch123Loadboard(filters, creds) {
  if (!creds?.clientId) return []

  try {
    const token = await get123Token(creds)
    if (!token) return []

    // Map equipment types
    const equipMap = {
      'Dry Van': 'Van', 'Van': 'Van',
      'Reefer': 'Reefer', 'Refrigerated': 'Reefer',
      'Flatbed': 'Flatbed', 'Step Deck': 'StepDeck',
      'Power Only': 'PowerOnly', 'Box Truck': 'BoxTruck',
      'Hotshot': 'HotShot', 'Sprinter': 'Sprinter',
    }
    const equipType = (filters.equipment && filters.equipment !== 'All')
      ? equipMap[filters.equipment] || 'Van'
      : 'Van'

    // Build search body
    const searchBody = {
      metadata: {},
      origin: {
        city: filters.origin || filters.originCity || '',
        state: filters.originState || '',
        radius: 100,
      },
      destination: {
        city: filters.destination || filters.destCity || '',
        state: filters.destState || '',
        radius: 100,
      },
      equipmentTypes: [equipType],
      loadSize: 'Tl',
      hasRate: true,
      includeWithGreaterPickupDates: true,
    }

    // Remove empty origin/dest if not provided
    if (!searchBody.origin.city && !searchBody.origin.state) delete searchBody.origin
    if (!searchBody.destination.city && !searchBody.destination.state) delete searchBody.destination

    const deviceId = 'qivori-dispatch-' + (creds.clientId || '').slice(-8)

    const res = await fetch('https://api.dev.123loadboard.com/loads/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        '123LB-Api-Version': '1.3',
        '123LB-AID': deviceId,
        'User-Agent': 'Qivori-Dispatch/1.0 (support@qivori.com)',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchBody),
    })

    if (!res.ok) return []
    const data = await res.json()
    return (data.loads || []).map(normalize123Load)
  } catch {
    return []
  }
}

function normalize123Load(load) {
  const origin = load.origin || {}
  const dest = load.destination || {}
  const miles = load.mileage || load.miles || load.distance || 0
  const gross = load.rate || load.price || load.amount || 0
  const rpm = miles > 0 ? +(gross / miles).toFixed(2) : 0
  const originCity = origin.city || load.originCity || ''
  const originState = origin.state || load.originState || ''
  const destCity = dest.city || load.destinationCity || ''
  const destState = dest.state || load.destinationState || ''

  return {
    id: `123-${load.id || load.loadId || Math.random().toString(36).slice(2, 8)}`,
    source: '123loadboard',
    broker: load.company?.name || load.companyName || load.poster || 'Unknown',
    brokerMC: load.company?.mcNumber || load.mcNumber || '',
    brokerPhone: load.company?.phone || load.contactPhone || '',
    origin: originCity && originState ? `${originCity}, ${originState}` : originCity || originState || '',
    originCity,
    originState,
    dest: destCity && destState ? `${destCity}, ${destState}` : destCity || destState || '',
    destCity,
    destState,
    miles,
    rate: rpm,
    gross,
    weight: load.weight || '',
    commodity: load.commodity || load.description || '',
    equipment: normalizeEquipment(load.equipmentType || load.equipment || ''),
    pickup: load.pickupDate || load.availableDate || '',
    delivery: load.deliveryDate || '',
    deadhead: load.deadheadMiles || load.deadhead || 0,
    refNum: load.referenceNumber || load.reference || '',
    postedAt: load.createdOn || load.postedDate || new Date().toISOString(),
    laneKey: `${originCity.slice(0, 3).toUpperCase()}→${destCity.slice(0, 3).toUpperCase()}`,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Truckstop.com API Integration
// Requires: TRUCKSTOP_CLIENT_ID, TRUCKSTOP_CLIENT_SECRET env vars
// Docs: https://developer.truckstop.com
// ══════════════════════════════════════════════════════════════════════════════

// Per-user Truckstop token cache
const tsTokenCache = new Map()

async function getTruckstopToken(creds) {
  const { clientId, clientSecret } = creds || {}
  if (!clientId || !clientSecret) return null

  const cacheKey = clientId
  const cached = tsTokenCache.get(cacheKey)
  if (cached && Date.now() < cached.expiry - 60000) return cached.token

  try {
    const res = await fetch('https://api.truckstop.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    })
    if (!res.ok) return null
    const data = await res.json()
    tsTokenCache.set(cacheKey, { token: data.access_token, expiry: Date.now() + (data.expires_in || 3600) * 1000 })
    return data.access_token
  } catch {
    return null
  }
}

async function fetchTruckstop(filters, creds) {
  const token = await getTruckstopToken(creds)
  if (!token) return []

  try {
    const body = { pageSize: 50 }
    if (filters.origin) body.originCity = filters.origin
    if (filters.originState) body.originState = filters.originState
    if (filters.destination) body.destinationCity = filters.destination
    if (filters.destState) body.destinationState = filters.destState
    if (filters.equipment && filters.equipment !== 'All') {
      body.equipmentType = filters.equipment
    }

    const res = await fetch('https://api.truckstop.com/loads/v2/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.loads || data.results || []).map(normalizeTruckstopLoad)
  } catch {
    return []
  }
}

function normalizeTruckstopLoad(load) {
  const miles = load.mileage || load.miles || 0
  const gross = load.rate || load.price || 0
  const rpm = miles > 0 ? +(gross / miles).toFixed(2) : 0

  return {
    id: `TS-${load.loadId || load.id || Math.random().toString(36).slice(2, 8)}`,
    source: 'truckstop',
    broker: load.companyName || load.poster?.companyName || 'Unknown',
    brokerMC: load.mcNumber || '',
    origin: `${load.originCity || ''}, ${load.originState || ''}`.trim().replace(/^,\s*/, ''),
    originCity: load.originCity || '',
    originState: load.originState || '',
    dest: `${load.destinationCity || ''}, ${load.destinationState || ''}`.trim().replace(/^,\s*/, ''),
    destCity: load.destinationCity || '',
    destState: load.destinationState || '',
    miles,
    rate: rpm,
    gross,
    weight: load.weight || '',
    commodity: load.commodity || '',
    equipment: normalizeEquipment(load.equipmentType || ''),
    pickup: load.pickupDate || '',
    delivery: load.deliveryDate || '',
    deadhead: load.deadheadMiles || 0,
    refNum: load.referenceNumber || '',
    postedAt: load.postedDate || new Date().toISOString(),
    laneKey: `${(load.originCity || '').slice(0, 3).toUpperCase()}→${(load.destinationCity || '').slice(0, 3).toUpperCase()}`,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Shared utilities
// ══════════════════════════════════════════════════════════════════════════════

function normalizeEquipment(raw) {
  const s = (raw || '').toLowerCase()
  if (s.includes('van') || s === 'v') return 'Dry Van'
  if (s.includes('reef') || s === 'r') return 'Reefer'
  if (s.includes('flat') || s === 'f') return 'Flatbed'
  if (s.includes('step')) return 'Step Deck'
  if (s.includes('tank')) return 'Tanker'
  if (s.includes('power') || s.includes('bobtail')) return 'Power Only'
  return raw || 'Dry Van'
}

function scoreLoad(load) {
  let score = 50 // base
  // RPM premium vs $2.70 market avg
  const rpmDiff = (load.rate - 2.70) / 2.70
  score += Math.min(25, Math.max(-15, rpmDiff * 40))
  // Deadhead penalty
  if (load.miles > 0) {
    const dhRatio = (load.deadhead || 0) / load.miles
    score -= Math.min(20, dhRatio * 35)
  }
  // Gross pay bonus
  if (load.gross >= 3000) score += 5
  if (load.gross >= 5000) score += 5
  // Source bonus (DAT is premium data)
  if (load.source === 'dat') score += 3
  return Math.min(99, Math.max(15, Math.round(score)))
}

function applyFilters(loads, filters) {
  let result = Array.isArray(loads) ? loads.filter(l => l && l.id) : []

  if (filters.origin) {
    const q = filters.origin.toLowerCase()
    result = result.filter(l =>
      (l.origin || '').toLowerCase().includes(q) ||
      (l.originCity || '').toLowerCase().includes(q) ||
      (l.originState || '').toLowerCase() === q
    )
  }
  if (filters.destination) {
    const q = filters.destination.toLowerCase()
    result = result.filter(l =>
      (l.dest || '').toLowerCase().includes(q) ||
      (l.destCity || '').toLowerCase().includes(q) ||
      (l.destState || '').toLowerCase() === q
    )
  }
  if (filters.equipment && filters.equipment !== 'All') {
    result = result.filter(l => l.equipment === filters.equipment)
  }
  if (filters.minRate) {
    result = result.filter(l => l.rate >= parseFloat(filters.minRate))
  }
  if (filters.maxDeadhead) {
    result = result.filter(l => (l.deadhead || 0) <= parseInt(filters.maxDeadhead))
  }

  return result
}

function deduplicateLoads(loads) {
  const seen = new Set()
  return loads.filter(l => {
    const key = `${l.origin}|${l.dest}|${l.gross}|${l.broker}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── Supabase cache ──────────────────────────────────────────────────────────

async function cacheToSupabase(loads) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey || loads.length === 0) return

  try {
    // Clear old cache
    await fetch(`${supabaseUrl}/rest/v1/load_board_cache?id=neq.00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Prefer': 'return=minimal' },
    })

    // Insert new loads (store as JSON rows)
    const rows = loads.slice(0, 100).map(l => ({
      load_data: l,
      source: l.source,
      origin: l.origin,
      destination: l.dest,
      equipment: l.equipment,
      rate_per_mile: l.rate,
      gross_pay: l.gross,
      ai_score: l.aiScore || 50,
      cached_at: new Date().toISOString(),
    }))

    await fetch(`${supabaseUrl}/rest/v1/load_board_cache`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(rows),
    })
  } catch { /* silent */ }
}

async function getSupabaseCache() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) return null

  try {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour stale
    const res = await fetch(
      `${supabaseUrl}/rest/v1/load_board_cache?cached_at=gte.${cutoff}&order=ai_score.desc&limit=100`,
      { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
    )
    if (!res.ok) return null
    const rows = await res.json()
    return rows.map(r => r.load_data).filter(Boolean)
  } catch {
    return null
  }
}
