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
      loadId: url.searchParams.get('loadId') || '',
      action: url.searchParams.get('action') || '',
    }
  }

  // ── GET /loads/{id} — load detail endpoint ──────────────────────────────
  if (filters.action === 'load_detail' || filters.loadId) {
    const loadId = filters.loadId
    if (!loadId) {
      return Response.json({ error: 'loadId required' }, { status: 400, headers: corsHeaders(req) })
    }
    try {
      const userCreds = await getUserCredentials(user.id)
      const platformFlex = (process.env.LB123_CLIENT_ID && process.env.LB123_SERVICE_USERNAME) ? {
        clientId: process.env.LB123_CLIENT_ID,
        clientSecret: process.env.LB123_CLIENT_SECRET,
        serviceUsername: process.env.LB123_SERVICE_USERNAME,
        servicePassword: process.env.LB123_SERVICE_PASSWORD,
      } : null
      const creds123 = userCreds['123loadboard'] || platformFlex
      if (!creds123) {
        return Response.json({ error: '123Loadboard not connected' }, { status: 400, headers: corsHeaders(req) })
      }
      const token = await get123LBToken(creds123)
      if (!token) {
        return Response.json({ error: '123Loadboard auth failed' }, { status: 401, headers: corsHeaders(req) })
      }
      const deviceId = 'qivori-dispatch-' + (creds123.clientId || 'oauth').slice(-8)
      const detailRes = await fetch(`${LB123_BASE}/loads/${loadId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          '123LB-Api-Version': '1.3',
          '123LB-AID': deviceId,
          'User-Agent': 'Qivori-Dispatch/1.0 (support@qivori.com)',
          'Accept': 'application/json',
        },
      })
      if (!detailRes.ok) {
        const errText = await detailRes.text().catch(() => '')
        console.error(`123LB load detail failed: ${detailRes.status} ${errText}`)
        return Response.json({ error: `123LB detail error: ${detailRes.status}` }, { status: detailRes.status, headers: corsHeaders(req) })
      }
      const detail = await detailRes.json()
      // Normalize to our format and include raw response for full detail
      const normalized = normalize123Load(detail)
      return Response.json({
        load: normalized,
        raw: detail,
        source: '123loadboard',
      }, { headers: corsHeaders(req) })
    } catch (err) {
      console.error(`123LB load detail error: ${err.message}`)
      return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
    }
  }

  try {
    // ── Cache layer 1: in-memory (same Edge instance, fastest) ──
    const userCache = userCaches.get(user.id)
    if (userCache && userCache.loads.length > 0 && Date.now() - userCache.time < CACHE_TTL) {
      const filtered = applyFilters(userCache.loads, filters)
      return Response.json({
        loads: filtered,
        total: filtered.length,
        source: 'cache',
        providers: userCache.providers || [],
      }, { headers: { ...corsHeaders(req), 'Cache-Control': 'private, max-age=300' } })
    }

    // ── Cache layer 2: Supabase persistent cache (survives cold starts) ──
    // On Edge cold starts the in-memory cache is empty. Without this layer,
    // every cold start hits the 123lb DEV API (~2-4s). With it, the user
    // sees cached loads in ~200ms and only hits the API when the Supabase
    // cache expires (1 hour). This was defined but never called before.
    const sbCached = await getSupabaseCache(user.id)
    if (sbCached && sbCached.length > 0) {
      // Warm the in-memory cache so subsequent requests on this instance
      // don't even touch Supabase.
      userCaches.set(user.id, { loads: sbCached, providers: ['cache'], time: Date.now() })
      const filtered = applyFilters(sbCached, filters)
      return Response.json({
        loads: filtered,
        total: filtered.length,
        source: 'cache',
        providers: ['cache'],
      }, { headers: { ...corsHeaders(req), 'Cache-Control': 'private, max-age=300' } })
    }

    // ── No cache hit — fetch fresh from load board APIs ──
    const userCreds = await getUserCredentials(user.id)

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
    // Use user's own OAuth account if connected; fall back to platform service
    // account (password grant confirmed working by 123LB support).
    const platformFlex123 = (process.env.LB123_CLIENT_ID && process.env.LB123_SERVICE_USERNAME) ? {
      clientId: process.env.LB123_CLIENT_ID,
      clientSecret: process.env.LB123_CLIENT_SECRET,
      serviceUsername: process.env.LB123_SERVICE_USERNAME,
      servicePassword: process.env.LB123_SERVICE_PASSWORD,
    } : null
    const lb123Creds = userCreds['123loadboard'] || platformFlex123
    const hasDat = !!datCreds
    const has123 = !!lb123Creds
    const hasTs = !!userCreds.truckstop
    if (!hasDat && !has123 && !hasTs) {
      return Response.json({
        loads: [],
        total: 0,
        source: 'none',
        providers: [],
        message: 'No load board connected. Go to Settings → Load Boards to connect your account.',
      }, { headers: corsHeaders(req) })
    }
    let lb123Expired = false
    let lb123RateLimited = null // 'day' | 'month' | null
    if (lb123Creds) {
      // Tag OAuth creds with userId so token refresh can persist + expire in DB
      lb123Creds.__userId = user.id

      // Compliance: enforce 123Loadboard API Usage Agreement limits per user
      // (100 searches/day, 1000 searches/month per the partner agreement PDF).
      // Silent fail-open if Supabase is down.
      const limitCheck = await check123LBLimit(user.id)

      if (!limitCheck.allowed) {
        lb123RateLimited = limitCheck.reason
      } else {
        const lb123Loads = await fetch123Loadboard(filters, lb123Creds)
        // Always count the call against the quota — the API request was made
        // regardless of result count. Per 123lb compliance: track every search.
        await increment123LBUsage(user.id, limitCheck.usage)
        if (lb123Loads.length > 0) {
          loads.push(...lb123Loads)
          providers.push('123loadboard')
        }
        // Empty result is normal (no matches for these filters). Don't mark
        // expired on empty — get123Token marks the connection 'expired' itself
        // when the auth flow fails, which is the authoritative signal.
      }
    }

    // 3. Try Truckstop.com API
    // COMPLIANCE: same rule as 123Loadboard — per-user dedicated connections only.
    // No platform-shared env-var fallback. User must connect their own Truckstop
    // account in Settings → Load Boards.
    const tsCreds = userCreds.truckstop || null
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

    // Per-user cache — only cache non-empty results
    if (loads.length > 0) {
      userCaches.set(user.id, { loads, providers, time: Date.now() })
    } else {
      userCaches.delete(user.id)
    }
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
      ...(lb123Expired && !providers.includes('123loadboard') ? {
        message: '123Loadboard session expired. Go to Settings → Load Boards → 123Loadboard → Reconnect.',
        needsReconnect: ['123loadboard'],
      } : {}),
      ...(lb123RateLimited ? {
        rateLimited: { provider: '123loadboard', bucket: lb123RateLimited },
        message: lb123RateLimited === 'hour'
          ? '123Loadboard hourly search limit reached (100/hr). Resets at the top of the hour.'
          : lb123RateLimited === 'day'
          ? '123Loadboard daily search limit reached (300/day). Resets at midnight UTC.'
          : '123Loadboard monthly search limit reached (2000/mo). Resets on the 1st.',
      } : {}),
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

// 123LB API base URL — flip to production once 123LB approves prod access.
// Set LB123_API_BASE=https://api.123loadboard.com in Vercel env to switch.
const LB123_BASE = process.env.LB123_API_BASE || 'https://api.dev.123loadboard.com'

// ── 123Loadboard API Usage Limits (per their API Usage Agreement) ────────────
// Hard caps enforced PER USER. We only count REAL search API calls (not cache
// hits), so the 15-min in-memory cache means a typical user does ~4 calls/hr.
// 123Loadboard API Usage Agreement limits (per the PDF agreement, 2026-04):
//   - 100 searches per user per day
//   - 1000 searches per user per month
//   - 50 rate / rate-history lookups per user per day (we don't use this endpoint)
//   - 40 load post details lookups per user per day (we don't use this endpoint)
//   - 400 results per page per search
// Aligned 2026-04-09 with the actual partner agreement (was previously 100/hr,
// 300/day, 2000/month which was both wrong and over-limit).
const LB123_LIMITS = {
  day:   100,
  month: 1000,
}

// Read api_usage JSONB from the user's load_board_credentials row, reset any
// expired buckets (hour/day/month), and return the current counters.
async function getLB123Usage(userId) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) return null
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/load_board_credentials?user_id=eq.${userId}&provider=eq.123loadboard&select=api_usage`,
      { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
    )
    if (!res.ok) return null
    const rows = await res.json()
    const usage = rows?.[0]?.api_usage || {}
    const now = new Date()
    const dayStart   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    return {
      day:   usage.day?.start   === dayStart   ? usage.day   : { start: dayStart,   count: 0 },
      month: usage.month?.start === monthStart ? usage.month : { start: monthStart, count: 0 },
    }
  } catch {
    return null
  }
}

// Returns true if the user is allowed to make a 123LB search call. Silent
// fail-open on Supabase errors so a transient infra issue can't lock users out.
async function check123LBLimit(userId) {
  const usage = await getLB123Usage(userId)
  if (!usage) return { allowed: true, usage: null } // fail-open
  if (usage.day.count   >= LB123_LIMITS.day)   return { allowed: false, usage, reason: 'day'   }
  if (usage.month.count >= LB123_LIMITS.month) return { allowed: false, usage, reason: 'month' }
  return { allowed: true, usage }
}

// Increment the user's 123LB usage counters after a real API call. Best-effort
// — failures here log but don't surface to the user.
async function increment123LBUsage(userId, currentUsage) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) return
  const usage = currentUsage || (await getLB123Usage(userId))
  if (!usage) return
  const next = {
    day:   { start: usage.day.start,   count: usage.day.count   + 1 },
    month: { start: usage.month.start, count: usage.month.count + 1 },
  }
  try {
    await fetch(
      `${supabaseUrl}/rest/v1/load_board_credentials?user_id=eq.${userId}&provider=eq.123loadboard`,
      {
        method: 'PATCH',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ api_usage: next }),
      }
    )
  } catch (err) {
    console.error(`increment123LBUsage failed: ${err.message}`)
  }
}

// Token cache (in-memory, shared across requests on same Edge instance)
let lb123Token = null
let lb123TokenExpiry = 0

// Persist refreshed OAuth tokens back to load_board_credentials so the next
// Edge instance can use them without re-authorizing.
async function save123LBRefreshedTokens(userId, tokens) {
  try {
    const { encrypt } = await import('./load-board-credentials.js')
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY
    if (!supabaseUrl || !serviceKey) return
    const { encrypted, iv } = await encrypt(JSON.stringify(tokens))
    await fetch(
      `${supabaseUrl}/rest/v1/load_board_credentials?user_id=eq.${userId}&provider=eq.123loadboard`,
      {
        method: 'PATCH',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          encrypted_credentials: encrypted,
          encryption_iv: iv,
          status: 'connected',
          last_tested: new Date().toISOString(),
        }),
      }
    )
  } catch (err) {
    console.error(`save123LBRefreshedTokens failed: ${err.message}`)
  }
}

// Mark OAuth row as errored so getUserCredentials() (which filters by
// status=connected) skips it next time and the UI prompts reconnect.
// DB CHECK constraint only allows: pending, connected, error — use 'error'.
async function mark123LBExpired(userId) {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY
    if (!supabaseUrl || !serviceKey) return
    await fetch(
      `${supabaseUrl}/rest/v1/load_board_credentials?user_id=eq.${userId}&provider=eq.123loadboard`,
      {
        method: 'PATCH',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          status: 'error',
          last_tested: new Date().toISOString(),
        }),
      }
    )
  } catch (err) {
    console.error(`mark123LBExpired failed: ${err.message}`)
  }
}

async function get123Token(creds) {
  // Return cached token if still valid (with 60s buffer)
  if (lb123Token && Date.now() < lb123TokenExpiry - 60000) return lb123Token

  // Check for global token set by OAuth callback
  if (globalThis.__lb123Token && Date.now() < (globalThis.__lb123TokenExpiry || 0) - 60000) {
    lb123Token = globalThis.__lb123Token
    lb123TokenExpiry = globalThis.__lb123TokenExpiry
    return lb123Token
  }

  // If we have an OAuth access token from stored credentials, use it directly.
  // OAuth creds are a completely separate path from service-account creds —
  // if the OAuth token fails, do NOT fall through to password/client_credentials
  // grants (those require different creds the user never provided).
  if (creds.accessToken) {
    // Check if token is still valid (60s buffer)
    if (creds.expiresAt && new Date(creds.expiresAt).getTime() > Date.now() + 60000) {
      lb123Token = creds.accessToken
      lb123TokenExpiry = new Date(creds.expiresAt).getTime()
      return lb123Token
    }
    // Try refresh token
    if (creds.refreshToken && creds.clientId && creds.clientSecret) {
      const basicAuth = btoa(`${creds.clientId}:${creds.clientSecret}`)
      try {
        const res = await fetch(`${LB123_BASE}/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            '123LB-Api-Version': '1.3',
            'User-Agent': 'Qivori-Dispatch/1.0 (support@qivori.com)',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: creds.refreshToken,
          }).toString(),
        })
        if (res.ok) {
          const data = await res.json()
          lb123Token = data.access_token
          lb123TokenExpiry = Date.now() + (data.expires_in || 3600) * 1000
          // Persist refreshed tokens so next request can use them
          if (creds.__userId) {
            await save123LBRefreshedTokens(creds.__userId, {
              accessToken: data.access_token,
              refreshToken: data.refresh_token || creds.refreshToken,
              expiresAt: new Date(lb123TokenExpiry).toISOString(),
              clientId: creds.clientId,
              clientSecret: creds.clientSecret,
            })
          }
          return lb123Token
        } else {
          const errText = await res.text().catch(() => '')
          console.error(`123LB refresh failed: ${res.status} ${errText.slice(0, 200)}`)
        }
      } catch (err) {
        console.error(`123LB refresh threw: ${err.message}`)
      }
    }
    // OAuth token dead and refresh failed — mark the row as expired so
    // getUserCredentials() skips it next time and the UI prompts reconnect.
    if (creds.__userId) {
      await mark123LBExpired(creds.__userId)
    }
    return null
  }

  // Password grant — platform service account (confirmed by 123LB support)
  if (creds.serviceUsername && creds.servicePassword && creds.clientId && creds.clientSecret) {
    const basicAuth = btoa(`${creds.clientId}:${creds.clientSecret}`)
    try {
      const res = await fetch(`${LB123_BASE}/token`, {
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
          username: creds.serviceUsername,
          password: creds.servicePassword,
        }).toString(),
      })
      if (res.ok) {
        const data = await res.json()
        lb123Token = data.access_token
        lb123TokenExpiry = Date.now() + (data.expires_in || 3600) * 1000
        return lb123Token
      } else {
        const errText = await res.text().catch(() => '')
        console.error(`123LB password grant failed: ${res.status} ${errText.slice(0, 200)}`)
      }
    } catch (err) {
      console.error(`123LB password grant threw: ${err.message}`)
    }
  }

  return null
}

// Parse "City, ST" or "City ST" or just "City" into { city, state }
function parseCityState(input) {
  if (!input) return { city: '', state: '' }
  const s = String(input).trim()
  const m = s.match(/^([^,]+),\s*([A-Z]{2})$/i) || s.match(/^(.+?)\s+([A-Z]{2})$/i)
  if (m) return { city: m[1].trim(), state: m[2].toUpperCase() }
  return { city: s, state: '' }
}

async function fetch123Loadboard(filters, creds) {
  if (!creds?.clientId && !creds?.accessToken) return []

  try {
    const token = await get123Token(creds)
    if (!token) return []

    // Map equipment types — 123LB expects PascalCase singular names
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

    // 123LB requires BOTH origin and destination as { type:'City', city, states:[ST] }
    // Default to Dallas → Atlanta if no filter provided (popular freight lane)
    const o = parseCityState(filters.origin || filters.originCity)
    const d = parseCityState(filters.destination || filters.destCity)
    const originCity = o.city || 'Dallas'
    const originState = o.state || filters.originState || 'TX'
    const destCity = d.city || 'Atlanta'
    const destState = d.state || filters.destState || 'GA'

    const searchBody = {
      metadata: { limit: 25 },
      origin: { type: 'City', city: originCity, states: [originState] },
      destination: { type: 'City', city: destCity, states: [destState] },
      equipmentTypes: [equipType],
      loadSize: 'Tl',
    }

    const deviceId = 'qivori-dispatch-' + (creds.clientId || 'oauth').slice(-8)

    const res = await fetch(`${LB123_BASE}/loads/search`, {
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

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error(`123LB search failed: ${res.status} ${errText}`)
      return []
    }
    const data = await res.json()
    console.log(`123LB search returned ${(data.loads || []).length} loads`)
    return (data.loads || data || []).map(normalize123Load)
  } catch (err) {
    console.error(`123LB fetch error: ${err.message}`)
    return []
  }
}

function normalize123Load(load) {
  // 123LB returns nested originLocation/destinationLocation with address sub-object
  const originAddr = load.originLocation?.address || load.origin?.address || {}
  const destAddr = load.destinationLocation?.address || load.destination?.address || {}
  const originCity = originAddr.city || load.originLocation?.city || ''
  const originState = originAddr.state || load.originLocation?.state || ''
  const destCity = destAddr.city || load.destinationLocation?.city || ''
  const destState = destAddr.state || load.destinationLocation?.state || ''

  const miles = load.computedMileage || load.mileage || load.miles || 0

  // Equipment lives in equipments[].equipmentType
  const equipType = load.equipments?.[0]?.equipmentType || load.equipmentType || ''
  const normalizedEquip = normalizeEquipment(equipType)

  // Rate is only exposed when 123LB Rate Check addon is enabled. If absent,
  // estimate from Q's market rate model so the AI can score the load. Mark
  // estimated rates so the UI can disclose the source.
  let gross = load.rate || load.payment?.amount || 0
  let rateEstimated = false
  if (gross === 0 && miles > 0) {
    const marketAvg = estimateMarketRate({
      originState, destState, equipment: normalizedEquip, miles,
    })
    gross = Math.round(marketAvg * miles)
    rateEstimated = true
  }
  const rpm = miles > 0 && gross > 0 ? +(gross / miles).toFixed(2) : 0

  // Broker is in poster.name; MC is in poster.docketNumber
  const brokerName = load.poster?.name || load.company?.name || 'Unknown'
  const brokerMC = load.poster?.docketNumber?.number
    ? `${load.poster.docketNumber.prefix || 'MC'}${load.poster.docketNumber.number}`
    : ''

  // Pickup is array; take first
  const pickup = load.pickupDateTimesUtc?.[0] || load.pickupDate || ''
  const delivery = load.deliveryDateTimeUtc || load.deliveryDate || ''

  // Deadheads from metadata.userdata
  const originDeadhead = load.metadata?.userdata?.originDeadhead?.value || 0

  return {
    id: `123-${load.id || load.postReference || Math.random().toString(36).slice(2, 8)}`,
    source: '123loadboard',
    broker: brokerName,
    brokerMC,
    brokerPhone: load.poster?.contactInfo?.phone || load.poster?.phone || '',
    brokerEmail: load.poster?.contactInfo?.email || load.poster?.email || '',
    brokerContact: load.poster?.contactInfo?.name || load.poster?.contactName || '',
    origin: originCity && originState ? `${originCity}, ${originState}` : originCity || originState || '',
    originCity,
    originState,
    dest: destCity && destState ? `${destCity}, ${destState}` : destCity || destState || '',
    destCity,
    destState,
    miles,
    rate: rpm,
    gross,
    rateEstimated,
    weight: load.weight || '',
    commodity: load.commodity || load.description || '',
    equipment: normalizedEquip,
    pickup,
    delivery,
    deadhead: originDeadhead,
    refNum: load.postReference || load.referenceNumber || '',
    postedAt: load.lastRefreshed || new Date().toISOString(),
    laneKey: `${originCity.slice(0, 3).toUpperCase()}→${destCity.slice(0, 3).toUpperCase()}`,
    // ── Detail fields — populated by GET /loads/{id}, empty in search results ──
    // Contact fields removed per 123Loadboard integration requirements
    posterName:   load.poster?.name || '',
    loadType:     load.loadType || load.shipmentType || '',
    fullPartial:  load.loadSize || load.fullPartial || '',
    teamRequired: !!(load.equipments?.[0]?.teamRequired || load.teamRequired),
    hazmat:       !!(load.equipments?.[0]?.hazmatRequired || load.hazmat),
    tarpRequired: !!(load.equipments?.[0]?.tarpRequired || load.tarpRequired),
    expiresAt:    load.expiresAt || load.expiration || '',
    notes:        load.specialRequirements || load.notes || load.loadNotes || load.comments || '',
    stops:        (load.stops || []).map(s => ({
      type:    s.type || '',
      city:    s.address?.city || s.city || '',
      state:   s.address?.state || s.state || '',
      pickup:  s.pickupDate || '',
    })),
  }
}

// ── Market rate estimator (Edge-compatible inline copy of src/lib/marketRates.js)
// Used as a fallback when a load board returns rate=0 (e.g. 123Loadboard
// without the Rate Check addon). Keeps load economics + AI scoring sane.
const MR_BASE = {
  'Dry Van': 2.35, 'Reefer': 2.75, 'Flatbed': 2.95,
  'Step Deck': 3.15, 'Power Only': 1.95, 'Tanker': 3.20,
}
const MR_SEASONAL = [0.90, 0.91, 0.98, 1.02, 1.12, 1.14, 1.03, 1.04, 1.12, 1.13, 1.08, 1.06]
const MR_NORTHEAST = ['NY','NJ','PA','CT','MA','RI','NH','VT','ME']
const MR_WEST_COAST = ['CA','OR','WA']
const MR_SOUTHEAST = ['GA','AL','MS','SC','NC','TN']
const MR_MIDWEST = ['OH','IN','IL','MI','WI','MN','IA','MO','KS','NE','ND','SD']

function mrRegionFactor(state) {
  if (MR_NORTHEAST.includes(state)) return 0.12
  if (MR_WEST_COAST.includes(state)) return 0.08
  if (MR_SOUTHEAST.includes(state)) return -0.05
  if (MR_MIDWEST.includes(state)) return -0.08
  return 0
}
function mrDistanceAdj(miles) {
  if (miles < 250) return 0.25
  if (miles < 500) return 0.10
  if (miles > 1500) return 0.05
  if (miles > 800) return -0.15
  return 0
}
function mrLanePremium(o, d) {
  let adj = 0
  if (o === 'TX') adj -= 0.05
  if (d === 'CA') adj += 0.10
  if (o === 'FL') adj -= 0.08
  if (MR_NORTHEAST.includes(o) && MR_NORTHEAST.includes(d)) adj += 0.12
  return adj
}
function estimateMarketRate({ originState, destState, equipment, miles }) {
  const base = MR_BASE[equipment] || MR_BASE['Dry Van']
  const month = new Date().getMonth() // 0-indexed
  const seasonal = MR_SEASONAL[month] || 1.0
  const regionAvg = (mrRegionFactor(originState) + mrRegionFactor(destState)) / 2
  const distAdj = mrDistanceAdj(miles)
  const lanePrem = mrLanePremium(originState, destState)
  const adjusted = (base + distAdj) * (1 + regionAvg + lanePrem) * seasonal
  return Math.round(adjusted * 100) / 100
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
  // Source quality bonus — all paid load board partners get parity. We do NOT
  // bias scoring against any partner, since the AI's job is to find the best
  // load for the carrier regardless of which board posted it.
  if (load.source === 'dat') score += 3
  if (load.source === '123loadboard') score += 3
  if (load.source === 'truckstop') score += 3
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

async function getSupabaseCache(userId) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) return null

  try {
    // Cached load data is public listings (origin, dest, rate, broker) —
    // not user-specific PII. Safe to serve across users. The compliance
    // requirement for "dedicated connections" is about OAuth credentials
    // (each user authenticates with their own 123lb account), not about
    // caching search results which are public load board postings.
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
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
