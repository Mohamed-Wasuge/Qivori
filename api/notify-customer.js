import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { generateTrackingToken } from './_lib/tracking-token.js'
import { sendSMS, validatePhone } from './_lib/sms.js'
import { sendEmail } from './_lib/emails.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

/**
 * POST /api/notify-customer
 *
 * Sends tracking notifications to shipper/broker via SMS and/or email.
 * Requires auth. Includes a tracking link in every notification.
 *
 * Body: { loadId, event, recipientPhone?, recipientEmail?, loadNumber?, origin?, destination? }
 * Events: picked_up, in_transit, delayed, delivered, eta_update
 */

const EVENT_TEMPLATES = {
  picked_up: (d) => ({
    subject: `Load ${d.loadNumber} Picked Up`,
    sms: `Qivori Tracking: Load #${d.loadNumber} has been picked up at ${d.origin || 'origin'}. Track: ${d.trackingUrl}`,
    html: buildEmailHtml(
      `Load #${d.loadNumber} Picked Up`,
      `<p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Your shipment <strong style="color:#fff;">#${d.loadNumber}</strong> has been picked up at <strong style="color:#fff;">${d.origin || 'origin'}</strong>.</p>
       <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Destination: <strong style="color:#fff;">${d.destination || 'destination'}</strong></p>`,
      d.trackingUrl
    ),
  }),

  in_transit: (d) => ({
    subject: `Load ${d.loadNumber} In Transit`,
    sms: `Qivori Tracking: Load #${d.loadNumber} is now in transit. ${d.origin || ''} to ${d.destination || ''}. Track: ${d.trackingUrl}`,
    html: buildEmailHtml(
      `Load #${d.loadNumber} In Transit`,
      `<p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Your shipment <strong style="color:#fff;">#${d.loadNumber}</strong> is now in transit from <strong style="color:#fff;">${d.origin || 'origin'}</strong> to <strong style="color:#fff;">${d.destination || 'destination'}</strong>.</p>
       ${d.eta ? `<p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Estimated delivery: <strong style="color:#f0a500;">${d.eta}</strong></p>` : ''}`,
      d.trackingUrl
    ),
  }),

  delayed: (d) => ({
    subject: `Load ${d.loadNumber} — Delay Notice`,
    sms: `Qivori Tracking: Load #${d.loadNumber} is experiencing a delay. We'll keep you updated. Track: ${d.trackingUrl}`,
    html: buildEmailHtml(
      `Load #${d.loadNumber} — Delay Notice`,
      `<p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Your shipment <strong style="color:#fff;">#${d.loadNumber}</strong> is experiencing a delay.</p>
       <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">We are monitoring the situation and will provide updates as they become available.</p>
       ${d.reason ? `<p style="color:#f0a500;font-size:13px;">Reason: ${d.reason}</p>` : ''}`,
      d.trackingUrl
    ),
  }),

  delivered: (d) => ({
    subject: `Load ${d.loadNumber} Delivered`,
    sms: `Qivori Tracking: Load #${d.loadNumber} has been delivered at ${d.destination || 'destination'}. Track: ${d.trackingUrl}`,
    html: buildEmailHtml(
      `Load #${d.loadNumber} Delivered`,
      `<p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Your shipment <strong style="color:#fff;">#${d.loadNumber}</strong> has been successfully delivered at <strong style="color:#22c55e;">${d.destination || 'destination'}</strong>.</p>
       <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Thank you for shipping with us.</p>`,
      d.trackingUrl
    ),
  }),

  eta_update: (d) => ({
    subject: `Load ${d.loadNumber} — ETA Update`,
    sms: `Qivori Tracking: Load #${d.loadNumber} ETA updated${d.eta ? ': ' + d.eta : ''}. Track: ${d.trackingUrl}`,
    html: buildEmailHtml(
      `Load #${d.loadNumber} — ETA Update`,
      `<p style="color:#8a8a9a;font-size:14px;line-height:1.6;">The estimated arrival for shipment <strong style="color:#fff;">#${d.loadNumber}</strong> has been updated.</p>
       ${d.eta ? `<p style="color:#f0a500;font-size:16px;font-weight:700;">New ETA: ${d.eta}</p>` : ''}`,
      d.trackingUrl
    ),
  }),
}

function buildEmailHtml(title, bodyContent, trackingUrl) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;">
<span style="font-size:32px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
<span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
</div>
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:32px 24px;margin-bottom:24px;">
<h2 style="color:#fff;font-size:20px;margin:0 0 16px;">${title}</h2>
${bodyContent}
<div style="text-align:center;margin-top:24px;">
<a href="${trackingUrl}" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Track Shipment</a>
</div>
</div>
<div style="text-align:center;padding-top:16px;">
<p style="color:#555;font-size:11px;margin:0;">Powered by Qivori AI - AI-Powered TMS for Trucking</p>
</div></div></body></html>`
}

const VALID_EVENTS = Object.keys(EVENT_TEMPLATES)

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

  // Rate limit: 20 notifications per hour per user
  const rateLimitKey = `notify-customer:${user?.id || getClientIP(req)}`
  const { limited, resetMs } = rateLimit(rateLimitKey, 20, 3600000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  try {
    const body = await req.json()
    const { loadId, event, recipientPhone, recipientEmail, loadNumber, origin, destination, eta, reason } = body

    if (!loadId) {
      return Response.json({ error: 'loadId is required' }, { status: 400, headers: corsHeaders(req) })
    }

    if (!event || !VALID_EVENTS.includes(event)) {
      return Response.json(
        { error: `Invalid event. Must be one of: ${VALID_EVENTS.join(', ')}` },
        { status: 400, headers: corsHeaders(req) }
      )
    }

    if (!recipientPhone && !recipientEmail) {
      return Response.json({ error: 'At least one of recipientPhone or recipientEmail is required' }, { status: 400, headers: corsHeaders(req) })
    }

    // Generate tracking token and URL
    const ownerId = user.id
    const token = await generateTrackingToken(loadId, ownerId)
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'qivori.com'
    const protocol = req.headers.get('x-forwarded-proto') || 'https'

    let trackingUrl
    if (token) {
      trackingUrl = `${protocol}://${host}/#/track?token=${encodeURIComponent(token)}`
    } else {
      // Fallback to legacy token
      const legacyToken = btoa(`${ownerId}:${loadId}`)
      trackingUrl = `${protocol}://${host}/#/track/${legacyToken}`
    }

    // Build notification data
    const templateData = {
      loadNumber: loadNumber || loadId,
      origin: origin || '',
      destination: destination || '',
      eta: eta || '',
      reason: reason || '',
      trackingUrl,
    }

    // If we don't have load details, try fetching them
    if (!loadNumber || !origin || !destination) {
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
      if (supabaseUrl && serviceKey) {
        try {
          const loadRes = await fetch(
            `${supabaseUrl}/rest/v1/loads?id=eq.${loadId}&owner_id=eq.${ownerId}&select=load_id,load_number,origin,destination,delivery_date&limit=1`,
            { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
          )
          if (loadRes.ok) {
            const rows = await loadRes.json()
            if (rows?.length) {
              const load = rows[0]
              if (!templateData.loadNumber || templateData.loadNumber === loadId) {
                templateData.loadNumber = load.load_number || load.load_id || loadId
              }
              if (!templateData.origin) templateData.origin = load.origin || ''
              if (!templateData.destination) templateData.destination = load.destination || ''
              if (!templateData.eta && load.delivery_date) templateData.eta = load.delivery_date
            }
          }
        } catch {
          // Non-critical — use what we have
        }
      }
    }

    const template = EVENT_TEMPLATES[event](templateData)
    const results = { sms: null, email: null }

    // Send SMS if phone provided
    if (recipientPhone) {
      const phone = validatePhone(recipientPhone)
      if (phone.valid) {
        const smsResult = await sendSMS(recipientPhone, template.sms)
        results.sms = { sent: smsResult.ok, error: smsResult.error || null }
      } else {
        results.sms = { sent: false, error: phone.error }
      }
    }

    // Send email if address provided
    if (recipientEmail) {
      const emailResult = await sendEmail(recipientEmail, template.subject, template.html)
      results.email = { sent: emailResult.ok, error: emailResult.error || null }
    }

    return Response.json({
      ok: true,
      event,
      trackingUrl,
      results,
    }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
