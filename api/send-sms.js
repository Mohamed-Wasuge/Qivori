import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
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

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    return Response.json({ error: 'Twilio not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const { to, message } = await req.json()
    if (!to || !message) {
      return Response.json({ error: 'to and message are required' }, { status: 400, headers: corsHeaders(req) })
    }

    const cleanTo = to.replace(/[^\d+]/g, '')

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: cleanTo,
        From: fromNumber,
        Body: message,
      }).toString(),
    })

    if (!res.ok) {
      const err = await res.text()
      // Twilio send failed
      return Response.json({ error: 'Failed to send SMS' }, { status: 502, headers: corsHeaders(req) })
    }

    const data = await res.json()
    return Response.json({ success: true, sid: data.sid }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
