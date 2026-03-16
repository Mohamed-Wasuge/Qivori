import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { sendSMS } from './_lib/sms.js'
import { sendEmail } from './_lib/emails.js'

export const config = { runtime: 'edge' }

/**
 * Triggered when a load status changes.
 * Sends SMS + email to the relevant party (broker or carrier).
 *
 * POST { loadId, newStatus, loadInfo }
 * loadInfo: { origin, destination, rate, brokerName, brokerPhone, brokerEmail,
 *             carrierName, carrierPhone, carrierEmail, driverName, driverPhone }
 */

const STATUS_MESSAGES = {
  'Booked':           (l) => `Load ${l.loadId} booked! ${l.origin} → ${l.destination}. Rate: $${l.rate || 'TBD'}`,
  'Assigned':         (l) => `Load ${l.loadId} assigned to driver ${l.driverName || 'TBD'}. ${l.origin} → ${l.destination}`,
  'En Route to Pickup': (l) => `Driver en route to pickup for load ${l.loadId}. ${l.origin} → ${l.destination}`,
  'At Pickup':        (l) => `Driver arrived at pickup for load ${l.loadId}. ${l.origin}`,
  'Loaded':           (l) => `Load ${l.loadId} picked up and loaded. En route to ${l.destination}`,
  'In Transit':       (l) => `Load ${l.loadId} in transit. ${l.origin} → ${l.destination}`,
  'Delivered':        (l) => `Load ${l.loadId} delivered to ${l.destination}! POD pending.`,
  'Invoiced':         (l) => `Invoice created for load ${l.loadId}. Amount: $${l.rate || 'TBD'}`,
  'Paid':             (l) => `Payment received for load ${l.loadId}. Amount: $${l.rate || 'TBD'}`,
}

// Who to notify for each status change
const NOTIFY_BROKER = ['Assigned', 'En Route to Pickup', 'At Pickup', 'Loaded', 'In Transit', 'Delivered']
const NOTIFY_CARRIER = ['Booked', 'Paid']
const NOTIFY_DRIVER = ['Booked', 'Assigned']

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

  try {
    const { loadId, newStatus, loadInfo = {} } = await req.json()
    if (!loadId || !newStatus) {
      return Response.json({ error: 'loadId and newStatus required' }, { status: 400, headers: corsHeaders(req) })
    }

    const info = { loadId, ...loadInfo }
    const msgFn = STATUS_MESSAGES[newStatus]
    if (!msgFn) {
      return Response.json({ sent: [], message: 'No notification for this status' }, { headers: corsHeaders(req) })
    }

    const message = msgFn(info)
    const sent = []

    // SMS to broker
    if (NOTIFY_BROKER.includes(newStatus) && info.brokerPhone) {
      const result = await sendSMS(info.brokerPhone, `QIVORI: ${message}`)
      if (result.ok) sent.push({ to: 'broker', type: 'sms' })
    }

    // SMS to carrier
    if (NOTIFY_CARRIER.includes(newStatus) && info.carrierPhone) {
      const result = await sendSMS(info.carrierPhone, `QIVORI: ${message}`)
      if (result.ok) sent.push({ to: 'carrier', type: 'sms' })
    }

    // SMS to driver
    if (NOTIFY_DRIVER.includes(newStatus) && info.driverPhone) {
      const result = await sendSMS(info.driverPhone, `QIVORI: ${message}`)
      if (result.ok) sent.push({ to: 'driver', type: 'sms' })
    }

    // Email to broker on delivery
    if (newStatus === 'Delivered' && info.brokerEmail) {
      const html = buildDeliveryEmail(info)
      await sendEmail(info.brokerEmail, `Load ${loadId} Delivered — ${info.origin} → ${info.destination}`, html).catch(() => {})
      sent.push({ to: 'broker', type: 'email' })
    }

    // Save notification to Supabase
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY
    if (supabaseUrl && serviceKey) {
      await fetch(`${supabaseUrl}/rest/v1/notifications`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          title: `Load ${loadId} — ${newStatus}`,
          body: message,
          user_id: user?.id || 'system',
          read: false,
        }),
      }).catch(() => {})
    }

    return Response.json({ sent, message }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}

function buildDeliveryEmail(info) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;">
<span style="font-size:32px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
<span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
</div>
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:32px 24px;">
<h2 style="color:#22c55e;font-size:20px;margin:0 0 12px;">Load Delivered!</h2>
<div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;padding:20px;margin:16px 0;">
<div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:8px;">${info.origin || ''} → ${info.destination || ''}</div>
<div style="font-size:16px;color:#22c55e;font-weight:700;margin-bottom:4px;">$${info.rate || 'TBD'}</div>
<div style="font-size:12px;color:#8a8a9a;">Load ID: ${info.loadId} · Driver: ${info.driverName || 'N/A'}</div>
</div>
<p style="color:#8a8a9a;font-size:14px;line-height:1.6;">POD is pending. You'll be notified once the carrier uploads proof of delivery.</p>
<div style="text-align:center;margin-top:24px;">
<a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">View Load →</a>
</div>
</div>
</div></body></html>`
}
