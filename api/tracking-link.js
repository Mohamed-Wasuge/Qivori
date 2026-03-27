import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { generateTrackingToken } from './_lib/tracking-token.js'

export const config = { runtime: 'edge' }

/**
 * POST /api/tracking-link
 *
 * Generates a signed tracking URL for a load. Requires auth.
 * Returns { url, token } that the carrier can share with brokers/shippers.
 */
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Auth required
  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  try {
    const { loadId } = await req.json()

    if (!loadId) {
      return Response.json({ error: 'loadId is required' }, { status: 400, headers: corsHeaders(req) })
    }

    const ownerId = user.id

    // Verify the load belongs to this user
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (supabaseUrl && serviceKey) {
      const checkRes = await fetch(
        `${supabaseUrl}/rest/v1/loads?id=eq.${loadId}&owner_id=eq.${ownerId}&select=id&limit=1`,
        { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
      )
      if (checkRes.ok) {
        const rows = await checkRes.json()
        if (!rows?.length) {
          return Response.json({ error: 'Load not found or not owned by you' }, { status: 404, headers: corsHeaders(req) })
        }
      }
    }

    // Generate signed token
    const token = await generateTrackingToken(loadId, ownerId)
    if (!token) {
      // Fall back to legacy unsigned token if TRACKING_SECRET not configured
      const legacyToken = btoa(`${ownerId}:${loadId}`)
      const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'qivori.com'
      const protocol = req.headers.get('x-forwarded-proto') || 'https'
      const url = `${protocol}://${host}/#/track?token=${encodeURIComponent(legacyToken)}`
      return Response.json({ url, token: legacyToken, signed: false }, { headers: corsHeaders(req) })
    }

    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'qivori.com'
    const protocol = req.headers.get('x-forwarded-proto') || 'https'
    const url = `${protocol}://${host}/#/track?token=${encodeURIComponent(token)}`

    return Response.json({ url, token, signed: true }, { headers: corsHeaders(req) })
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
