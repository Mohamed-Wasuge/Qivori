import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { sendSMS } from './_lib/sms.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

/**
 * Unified SMS notification endpoint.
 * Sends templated SMS messages based on event type.
 *
 * POST { event, to, data }
 *   event: 'load_status' | 'invoice_paid' | 'invoice_overdue' |
 *          'compliance_expiring' | 'new_load_match' | 'delivery_reminder' | 'test'
 *   to: phone number (E.164 or 10-digit)
 *   data: object with fields specific to each event type
 */

const TEMPLATES = {
  load_status: (d) =>
    `Qivori: Load ${d.id || '—'} status → ${d.status || 'Updated'}. ${d.origin || ''}→${d.dest || ''}. Open app: qivori.com`,

  invoice_paid: (d) =>
    `Qivori: Invoice ${d.id || '—'} PAID! $${d.amount || '0'} received from ${d.broker || 'broker'}. Balance: $${d.total_unpaid || '0'}`,

  invoice_overdue: (d) =>
    `Qivori: Invoice ${d.id || '—'} is ${d.days || '?'} days overdue ($${d.amount || '0'}). Follow up with ${d.broker || 'broker'}.`,

  compliance_expiring: (d) =>
    `Qivori: Your ${d.doc_type || 'document'} expires in ${d.days || '?'} days. Renew now to stay compliant.`,

  new_load_match: (d) =>
    `Qivori: New load match! ${d.origin || ''}→${d.dest || ''} $${d.rate || '0'} (${d.rpm || '?'}/mi). Open app to book.`,

  delivery_reminder: (d) =>
    `Qivori: Reminder — Load ${d.id || '—'} delivery due ${d.date || 'TBD'} at ${d.dest || 'destination'}.`,

  test: () =>
    `Qivori AI: Test notification — Your SMS alerts are working! Reply STOP to unsubscribe.`,
}

const VALID_EVENTS = Object.keys(TEMPLATES)

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

  // Rate limit: 10 SMS per hour per user
  const rateLimitKey = `sms-notify:${user?.id || getClientIP(req)}`
  const { limited, resetMs } = rateLimit(rateLimitKey, 10, 3600000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  try {
    const { event, to, data = {} } = await req.json()

    if (!event || !VALID_EVENTS.includes(event)) {
      return Response.json(
        { error: `Invalid event. Must be one of: ${VALID_EVENTS.join(', ')}` },
        { status: 400, headers: corsHeaders(req) }
      )
    }

    if (!to) {
      return Response.json({ error: 'Phone number (to) is required' }, { status: 400, headers: corsHeaders(req) })
    }

    // Build message from template
    const message = TEMPLATES[event](data)

    // Send via Twilio
    const result = await sendSMS(to, message)

    if (!result.success) {
      return Response.json({ error: result.error || 'Failed to send SMS' }, { status: 502, headers: corsHeaders(req) })
    }

    // Log notification to Supabase if configured
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY
    if (supabaseUrl && serviceKey) {
      await fetch(`${supabaseUrl}/rest/v1/sms_notifications`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          user_id: user?.id || 'system',
          event_type: event,
          phone: to,
          message,
          sid: result.sid,
          sent_at: new Date().toISOString(),
        }),
      }).catch(() => {})
    }

    return Response.json({ success: true, sid: result.sid, event, message }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
