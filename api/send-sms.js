import { handleCors, corsHeaders, verifyAuth, requireActiveSubscription } from './_lib/auth.js'
import { sendSMS } from './_lib/sms.js'
import { checkRateLimit, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }
  const subErr = await requireActiveSubscription(req, user)
  if (subErr) return subErr

  // Rate limit: 5 requests per 60 seconds per user (Supabase-backed)
  const { limited, resetSeconds } = await checkRateLimit(user.id, 'send-sms', 5, 60)
  if (limited) return rateLimitResponse(req, corsHeaders, resetSeconds)

  try {
    const { to, message } = await req.json()
    if (!to || !message) {
      return Response.json({ error: 'to and message are required' }, { status: 400, headers: corsHeaders(req) })
    }

    const result = await sendSMS(to, message)

    if (!result.ok) {
      return Response.json(
        { error: result.error || 'Failed to send SMS', errorCode: result.errorCode },
        { status: 502, headers: corsHeaders(req) }
      )
    }

    return Response.json({ ok: true, messageId: result.messageId }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
