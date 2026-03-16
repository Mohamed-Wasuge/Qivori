import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

/**
 * POST /api/track-event
 *
 * Server-side event tracking endpoint for events that need server verification.
 * Accepts: { event: string, properties: object }
 * Rate limited: 100 events per minute per user.
 *
 * Logs events to Supabase `analytics_events` table if configured,
 * otherwise falls back to structured console logging.
 */
export default async function handler(req) {
  // CORS
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Auth
  const { user, error: authError } = await verifyAuth(req)
  if (authError || !user) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: corsHeaders(req) }
    )
  }

  // Rate limit: 100 events per minute per user
  const rlKey = `track-event:${user.id}`
  const { limited, resetMs } = rateLimit(rlKey, 100, 60_000)
  if (limited) {
    return rateLimitResponse(req, corsHeaders, resetMs)
  }

  // Parse body
  let body
  try {
    body = await req.json()
  } catch {
    return Response.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: corsHeaders(req) }
    )
  }

  const { event, properties } = body || {}

  if (!event || typeof event !== 'string') {
    return Response.json(
      { error: 'Missing or invalid "event" field' },
      { status: 400, headers: corsHeaders(req) }
    )
  }

  // Build event record
  const record = {
    user_id: user.id,
    event,
    properties: properties || {},
    ip: getClientIP(req),
    user_agent: req.headers.get('user-agent') || '',
    timestamp: new Date().toISOString(),
  }

  // Try to persist to Supabase analytics_events table
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && supabaseServiceKey) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/analytics_events`, {
        method: 'POST',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(record),
      })

      if (!res.ok) {
        // Table might not exist yet — log and continue
        console.warn('[track-event] Supabase insert failed:', res.status, await res.text())
      }
    } catch (err) {
      console.warn('[track-event] Supabase insert error:', err.message)
    }
  } else {
    // Fallback: structured console log (visible in Vercel logs)
    console.log('[track-event]', JSON.stringify(record))
  }

  return Response.json({ ok: true }, { status: 200, headers: corsHeaders(req) })
}
