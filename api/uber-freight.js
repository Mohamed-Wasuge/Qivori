// api/uber-freight.js — Uber Freight Integration
// OAuth 2.0 auth, load quoting, tendering, and tracking
// Docs: developer.uberfreight.com

import { handleCors, corsHeaders, verifyAuth, requireActiveSubscription } from './_lib/auth.js'
import { checkRateLimit, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

const UBER_CLIENT_ID = process.env.UBER_FREIGHT_CLIENT_ID
const UBER_CLIENT_SECRET = process.env.UBER_FREIGHT_CLIENT_SECRET
const UBER_API_BASE = 'https://api.uber.com'
const TOKEN_URL = 'https://login.uber.com/oauth/v2/token'

// In-memory token cache (per-instance, refreshes on cold start)
let cachedToken = null
let tokenExpiresAt = 0

// ─── OAuth 2.0 Token ─────────────────────────────────────────
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken
  }

  if (!UBER_CLIENT_ID || !UBER_CLIENT_SECRET) {
    throw new Error('Uber Freight credentials not configured')
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: UBER_CLIENT_ID,
      client_secret: UBER_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'freight.loads freight.quotes freight.tracking',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token error: ${err}`)
  }

  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiresAt = Date.now() + (data.expires_in * 1000)
  return cachedToken
}

// ─── API Helper ──────────────────────────────────────────────
async function uberAPI(path, options = {}) {
  const token = await getAccessToken()
  const res = await fetch(`${UBER_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Uber API error (${res.status}): ${err}`)
  }

  return res.json()
}

// ─── Handler ─────────────────────────────────────────────────
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const { user, error: authError } = await verifyAuth(req)
  if (authError) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

  const subErr = await requireActiveSubscription(req, user)
  if (subErr) return subErr

  const { limited, resetSeconds } = await checkRateLimit(user.id, 'uber-freight', 30, 60)
  if (limited) return rateLimitResponse(req, corsHeaders, resetSeconds)

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  try {
    // ── Test connection ─────────────────────────────────────
    if (action === 'test') {
      try {
        await getAccessToken()
        return Response.json({ ok: true, status: 'connected', message: 'Uber Freight API connected' }, { headers: corsHeaders(req) })
      } catch (err) {
        return Response.json({ ok: false, status: 'disconnected', message: err.message }, { headers: corsHeaders(req) })
      }
    }

    // ── Get instant quote ───────────────────────────────────
    if (action === 'quote' && req.method === 'POST') {
      const body = await req.json()
      const { origin, destination, pickupDate, deliveryDate, equipment, weight, commodity } = body

      if (!origin || !destination) {
        return Response.json({ error: 'origin and destination required' }, { status: 400, headers: corsHeaders(req) })
      }

      const quotePayload = {
        lanes: [{
          origin: {
            address: typeof origin === 'string' ? { rawAddress: origin } : origin,
          },
          destination: {
            address: typeof destination === 'string' ? { rawAddress: destination } : destination,
          },
          pickupAppointment: pickupDate ? {
            startTime: new Date(pickupDate).toISOString(),
            endTime: new Date(pickupDate).toISOString(),
          } : undefined,
          deliveryAppointment: deliveryDate ? {
            startTime: new Date(deliveryDate).toISOString(),
            endTime: new Date(deliveryDate).toISOString(),
          } : undefined,
          items: [{
            weight: weight ? { value: weight, unit: 'LB' } : { value: 40000, unit: 'LB' },
            description: commodity || 'General Freight',
          }],
          equipmentType: equipment || 'DRY_VAN',
        }],
      }

      const result = await uberAPI('/v2/freight/loads/quotes', {
        method: 'POST',
        body: JSON.stringify(quotePayload),
      })

      return Response.json({ ok: true, quotes: result }, { headers: corsHeaders(req) })
    }

    // ── Tender / book a load ────────────────────────────────
    if (action === 'tender' && req.method === 'POST') {
      const body = await req.json()
      const { quoteId, carrierInfo } = body

      if (!quoteId) {
        return Response.json({ error: 'quoteId required' }, { status: 400, headers: corsHeaders(req) })
      }

      const tenderPayload = {
        quoteId,
        carrier: carrierInfo || {},
      }

      const result = await uberAPI('/v1/freight/loads/tenders', {
        method: 'POST',
        body: JSON.stringify(tenderPayload),
      })

      return Response.json({ ok: true, tender: result }, { headers: corsHeaders(req) })
    }

    // ── Get load details ────────────────────────────────────
    if (action === 'load' && req.method === 'GET') {
      const loadId = url.searchParams.get('loadId')
      if (!loadId) {
        return Response.json({ error: 'loadId required' }, { status: 400, headers: corsHeaders(req) })
      }

      const result = await uberAPI(`/v1/freight/loads/${loadId}`)
      return Response.json({ ok: true, load: result }, { headers: corsHeaders(req) })
    }

    // ── List available loads ────────────────────────────────
    if (action === 'loads' && req.method === 'GET') {
      const originCity = url.searchParams.get('originCity')
      const originState = url.searchParams.get('originState')
      const destCity = url.searchParams.get('destCity')
      const destState = url.searchParams.get('destState')
      const equipment = url.searchParams.get('equipment') || 'DRY_VAN'

      const params = new URLSearchParams({ equipmentType: equipment })
      if (originCity) params.set('originCity', originCity)
      if (originState) params.set('originState', originState)
      if (destCity) params.set('destinationCity', destCity)
      if (destState) params.set('destinationState', destState)

      const result = await uberAPI(`/v1/freight/loads?${params}`)
      return Response.json({ ok: true, loads: result }, { headers: corsHeaders(req) })
    }

    // ── Track a load ────────────────────────────────────────
    if (action === 'track' && req.method === 'GET') {
      const loadId = url.searchParams.get('loadId')
      if (!loadId) {
        return Response.json({ error: 'loadId required' }, { status: 400, headers: corsHeaders(req) })
      }

      const result = await uberAPI(`/v1/freight/loads/${loadId}/tracking`)
      return Response.json({ ok: true, tracking: result }, { headers: corsHeaders(req) })
    }

    // ── Cancel a tender ─────────────────────────────────────
    if (action === 'cancel' && req.method === 'POST') {
      const body = await req.json()
      const { tenderId, reason } = body
      if (!tenderId) {
        return Response.json({ error: 'tenderId required' }, { status: 400, headers: corsHeaders(req) })
      }

      const result = await uberAPI(`/v1/freight/loads/tenders/${tenderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || 'Carrier cancelled' }),
      })

      return Response.json({ ok: true, result }, { headers: corsHeaders(req) })
    }

    return Response.json({ error: 'Unknown action. Use: test, quote, tender, load, loads, track, cancel' }, { status: 400, headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: err.message || 'Uber Freight API error' }, { status: 500, headers: corsHeaders(req) })
  }
}
