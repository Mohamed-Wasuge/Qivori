import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
import { sendSMS } from './_lib/sms.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  // Rate limit: 10 SMS per minute per IP
  const ip = getClientIP(req)
  const { limited, resetMs } = rateLimit(`sms:${ip}`, 10, 60000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

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
