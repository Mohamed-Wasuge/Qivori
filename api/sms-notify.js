import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { sendSMS, validatePhone } from './_lib/sms.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

/**
 * Unified SMS notification endpoint.
 * Sends templated SMS messages based on event type.
 * Checks opt-out status before sending. Supports Twilio status callbacks.
 *
 * POST { event, to, data }
 *   event: one of the TEMPLATES keys
 *   to: phone number (E.164 or 10-digit US)
 *   data: object with fields specific to each event type
 */

const TEMPLATES = {
  load_booked: (d) =>
    `Qivori: Load #${d.ref || d.id || '—'} booked! ${d.origin || ''} \u2192 ${d.dest || d.destination || ''}. Pickup: ${d.date || d.pickup_date || 'TBD'}`,

  load_delivered: (d) =>
    `Qivori: Load #${d.ref || d.id || '—'} delivered! Ready to invoice.`,

  invoice_sent: (d) =>
    `Qivori: Invoice #${d.num || d.invoice_number || '—'} sent to ${d.broker || 'broker'} for $${d.amount || '0'}.`,

  invoice_paid: (d) =>
    `Qivori: Payment received! $${d.amount || '0'} for Invoice #${d.num || d.invoice_number || '—'}.`,

  compliance_alert: (d) =>
    `Qivori: \u26a0\ufe0f Compliance alert: ${d.message || d.doc_type || 'Action required'}`,

  trial_ending: (d) =>
    `Qivori: Your Qivori trial ends in ${d.days || '?'} days. Upgrade at qivori.com`,

  weekly_summary: (d) =>
    `Qivori: Weekly: ${d.loads || 0} loads, $${d.revenue || '0'} revenue. Full report in app.`,

  // Legacy event types (still supported)
  load_status: (d) =>
    `Qivori: Load ${d.id || '—'} status \u2192 ${d.status || 'Updated'}. ${d.origin || ''}\u2192${d.dest || ''}. Open app: qivori.com`,

  invoice_overdue: (d) =>
    `Qivori: Invoice ${d.id || '—'} is ${d.days || '?'} days overdue ($${d.amount || '0'}). Follow up with ${d.broker || 'broker'}.`,

  compliance_expiring: (d) =>
    `Qivori: Your ${d.doc_type || 'document'} expires in ${d.days || '?'} days. Renew now to stay compliant.`,

  new_load_match: (d) =>
    `Qivori: New load match! ${d.origin || ''}\u2192${d.dest || ''} $${d.rate || '0'} (${d.rpm || '?'}/mi). Open app to book.`,

  delivery_reminder: (d) =>
    `Qivori: Reminder \u2014 Load ${d.id || '—'} delivery due ${d.date || 'TBD'} at ${d.dest || 'destination'}.`,

  test: () =>
    `Qivori AI: Test notification \u2014 Your SMS alerts are working! Reply STOP to unsubscribe.`,
}

const VALID_EVENTS = Object.keys(TEMPLATES)

/**
 * Check if a user has opted out of SMS by looking up their profile.
 */
async function isOptedOut(phone) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey || !phone) return false

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?phone=eq.${encodeURIComponent(phone)}&select=sms_opted_out`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      }
    )
    if (!res.ok) return false
    const rows = await res.json()
    if (rows.length > 0 && rows[0].sms_opted_out === true) return true
    return false
  } catch {
    return false
  }
}

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

    // Validate phone number
    const phone = validatePhone(to)
    if (!phone.valid) {
      return Response.json({ error: phone.error }, { status: 400, headers: corsHeaders(req) })
    }

    // Check opt-out status
    const optedOut = await isOptedOut(phone.number)
    if (optedOut) {
      return Response.json(
        { error: 'Recipient has opted out of SMS notifications', opted_out: true },
        { status: 403, headers: corsHeaders(req) }
      )
    }

    // Build message from template
    const message = TEMPLATES[event](data)

    // Build status callback URL if we know our host
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
    const protocol = req.headers.get('x-forwarded-proto') || 'https'
    const statusCallback = host ? `${protocol}://${host}/api/sms-webhook?type=status` : undefined

    // Send via Twilio
    const result = await sendSMS(to, message, { statusCallback })

    if (!result.ok) {
      return Response.json(
        { error: result.error || 'Failed to send SMS', errorCode: result.errorCode },
        { status: 502, headers: corsHeaders(req) }
      )
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
          phone: phone.number,
          message,
          sid: result.messageId,
          sent_at: new Date().toISOString(),
        }),
      }).catch(() => {})
    }

    return Response.json(
      { ok: true, messageId: result.messageId, event, message },
      { headers: corsHeaders(req) }
    )
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
