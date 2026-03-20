import { sendSMS } from './_lib/sms.js'

export const config = { runtime: 'edge' }

/**
 * SMS Load Reply Handler
 * Processes carrier replies to load alert SMS messages.
 *
 * Commands:
 *   YES <code>   — Book the load (creates carrier_loads entry, notifies broker)
 *   DETAILS <code> — Get more info about the load (broker, weight, commodity)
 *   MORE         — Send the next best available load match
 *   STOP         — Opt out of SMS load alerts
 *   START        — Opt back in to SMS load alerts
 *
 * Called from sms-webhook.js when an inbound SMS matches a load alert pattern.
 */

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

// — Supabase helpers —
async function supabaseQuery(table, query = '') {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
  })
  return res.json()
}

async function supabaseUpdate(table, filter, data) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  })
  return res.json()
}

async function supabaseInsert(table, data) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  })
  return res.json()
}

/**
 * Parse an inbound SMS body to detect load alert commands.
 * Returns { command, alertCode } or null if not a load command.
 */
export function parseLoadCommand(body) {
  if (!body || typeof body !== 'string') return null
  const upper = body.trim().toUpperCase()

  // YES <code> or YES<code> or just YES (matches most recent alert)
  const yesMatch = upper.match(/^YES\s*([A-Z0-9]{4,6})?$/)
  if (yesMatch) {
    return { command: 'YES', alertCode: yesMatch[1] || null }
  }

  // BOOK <code>
  const bookMatch = upper.match(/^BOOK\s*([A-Z0-9]{4,6})?$/)
  if (bookMatch) {
    return { command: 'YES', alertCode: bookMatch[1] || null }
  }

  // DETAILS <code> or INFO <code>
  const detailsMatch = upper.match(/^(?:DETAILS|INFO)\s*([A-Z0-9]{4,6})?$/)
  if (detailsMatch) {
    return { command: 'DETAILS', alertCode: detailsMatch[1] || null }
  }

  // MORE — send next load
  if (upper === 'MORE' || upper === 'NEXT') {
    return { command: 'MORE', alertCode: null }
  }

  // STOP — opt out of load alerts
  if (upper === 'STOP' || upper === 'STOPALL' || upper === 'UNSUBSCRIBE' || upper === 'CANCEL' || upper === 'END' || upper === 'QUIT') {
    return { command: 'STOP', alertCode: null }
  }

  // START — opt back in
  if (upper === 'START' || upper === 'UNSTOP') {
    return { command: 'START', alertCode: null }
  }

  return null
}

/**
 * Find the most recent SMS load alert for a phone number.
 * If alertCode is provided, match on that; otherwise use the latest.
 */
async function findAlert(phone, alertCode) {
  if (!supabaseUrl || !serviceKey) return null

  try {
    let query = `phone=eq.${encodeURIComponent(phone)}&order=created_at.desc&limit=1`
    if (alertCode) {
      query = `phone=eq.${encodeURIComponent(phone)}&alert_code=eq.${alertCode}&limit=1`
    }
    const alerts = await supabaseQuery('sms_load_alerts', query)
    return Array.isArray(alerts) && alerts.length > 0 ? alerts[0] : null
  } catch {
    return null
  }
}

/**
 * Handle YES — book the load.
 */
async function handleYes(phone, alertCode) {
  const alert = await findAlert(phone, alertCode)
  if (!alert) {
    return 'No matching load alert found. Make sure you include the code from the alert (e.g. YES L3K9P).'
  }

  if (alert.booked) {
    return 'This load has already been booked! Open qivori.com to view your booked loads.'
  }

  const load = alert.load_data || {}
  const origin = `${load.origin_city || ''}${load.origin_city && load.origin_state ? ', ' : ''}${load.origin_state || ''}`
  const dest = `${load.destination_city || ''}${load.destination_city && load.destination_state ? ', ' : ''}${load.destination_state || ''}`

  // Mark the alert as booked
  try {
    await supabaseUpdate('sms_load_alerts',
      `id=eq.${alert.id}`,
      { replied: true, reply_text: 'YES', booked: true, status: 'delivered' }
    )
  } catch (e) {
    console.error('Failed to update alert:', e)
  }

  // Create a carrier_loads entry or update load_matches status
  try {
    await supabaseUpdate('load_matches',
      `load_id=eq.${encodeURIComponent(alert.load_id)}&user_id=eq.${alert.user_id}`,
      { status: 'booked' }
    )
  } catch (e) {
    console.error('Failed to update load_matches:', e)
  }

  // Try to create a load entry in the loads table as "booked"
  try {
    await supabaseInsert('loads', {
      user_id: alert.user_id,
      load_number: `SMS-${alert.alert_code}`,
      origin: origin,
      destination: dest,
      rate: load.rate || 0,
      distance: load.miles || 0,
      equipment_type: load.equipment_type || 'Dry Van',
      broker_name: load.broker_name || 'Unknown',
      broker_phone: load.broker_phone || '',
      status: 'booked',
      notes: `Booked via SMS alert ${alert.alert_code}. Source: ${load.source || 'unknown'}`,
    })
  } catch (e) {
    // May fail if table schema differs — that's okay, the load_matches update is primary
    console.error('Failed to create load entry:', e)
  }

  return `Booked! ${origin} → ${dest} for $${Number(load.rate || 0).toLocaleString()}.\nBroker: ${load.broker_name || 'Unknown'} — we'll confirm details shortly.\nOpen qivori.com to manage this load.`
}

/**
 * Handle DETAILS — send more info about the load.
 */
async function handleDetails(phone, alertCode) {
  const alert = await findAlert(phone, alertCode)
  if (!alert) {
    return 'No matching load alert found. Make sure you include the code (e.g. DETAILS L3K9P).'
  }

  // Mark as replied
  try {
    await supabaseUpdate('sms_load_alerts',
      `id=eq.${alert.id}`,
      { replied: true, reply_text: 'DETAILS' }
    )
  } catch (e) { /* best effort */ }

  const load = alert.load_data || {}
  const origin = `${load.origin_city || ''}${load.origin_city && load.origin_state ? ', ' : ''}${load.origin_state || ''}`
  const dest = `${load.destination_city || ''}${load.destination_city && load.destination_state ? ', ' : ''}${load.destination_state || ''}`
  const rpm = load.rate && load.miles ? `$${(load.rate / load.miles).toFixed(2)}/mi` : 'N/A'
  const weight = load.weight ? `${Number(load.weight).toLocaleString()} lbs` : 'N/A'
  const commodity = load.commodity || 'Not specified'
  const broker = load.broker_name || 'Unknown'
  const brokerPhone = load.broker_phone || 'N/A'
  const score = load.match_score || '?'

  return `📋 Load ${alert.alert_code} Details\n${origin} → ${dest}\nRate: $${Number(load.rate || 0).toLocaleString()} (${rpm})\nMiles: ${load.miles || 'N/A'}\nWeight: ${weight}\nCommodity: ${commodity}\nEquipment: ${load.equipment_type || 'Dry Van'}\nBroker: ${broker} (${brokerPhone})\nScore: ${score}/100\n\nReply YES ${alert.alert_code} to book`
}

/**
 * Handle MORE — send the next best unbooked load.
 */
async function handleMore(phone) {
  if (!supabaseUrl || !serviceKey) {
    return 'Service temporarily unavailable. Try again later or open qivori.com.'
  }

  // Find the user by phone
  let userId = null
  try {
    const alerts = await supabaseQuery('sms_load_alerts',
      `phone=eq.${encodeURIComponent(phone)}&order=created_at.desc&limit=1&select=user_id`
    )
    if (Array.isArray(alerts) && alerts.length > 0) {
      userId = alerts[0].user_id
    }
  } catch { /* */ }

  if (!userId) {
    return 'No previous alerts found for your number. Load alerts will be sent when new matches are found.'
  }

  // Find load matches that haven't been sent as SMS alerts yet
  try {
    const matches = await supabaseQuery('load_matches',
      `user_id=eq.${userId}&status=neq.booked&score=gte.60&order=score.desc&limit=5`
    )

    if (!Array.isArray(matches) || matches.length === 0) {
      return 'No more load matches available right now. We\'ll text you when new loads come in!'
    }

    // Find one that hasn't been alerted yet
    const alertedLoads = await supabaseQuery('sms_load_alerts',
      `user_id=eq.${userId}&booked=eq.false&select=load_id`
    )
    const alertedIds = new Set((Array.isArray(alertedLoads) ? alertedLoads : []).map(a => a.load_id))

    const nextMatch = matches.find(m => !alertedIds.has(m.load_id)) || matches[0]

    // Generate alert code and send
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let alertCode = 'L'
    for (let i = 0; i < 4; i++) alertCode += chars[Math.floor(Math.random() * chars.length)]

    const origin = nextMatch.origin || 'Unknown'
    const dest = nextMatch.destination || 'Unknown'
    const rate = nextMatch.rate ? `$${Number(nextMatch.rate).toLocaleString()}` : 'TBD'
    const rpm = nextMatch.rate_per_mile ? `$${nextMatch.rate_per_mile}` : '?'
    const miles = nextMatch.distance_miles ? `${nextMatch.distance_miles}mi` : '?mi'
    const equip = nextMatch.equipment_type || 'Dry Van'

    // Store the alert
    try {
      await supabaseInsert('sms_load_alerts', {
        user_id: userId,
        load_id: nextMatch.load_id || String(nextMatch.id),
        phone: phone,
        alert_code: alertCode,
        load_data: {
          origin_city: nextMatch.origin?.split(',')[0]?.trim(),
          origin_state: nextMatch.origin?.split(',')[1]?.trim(),
          destination_city: nextMatch.destination?.split(',')[0]?.trim(),
          destination_state: nextMatch.destination?.split(',')[1]?.trim(),
          rate: nextMatch.rate,
          miles: nextMatch.distance_miles,
          equipment_type: nextMatch.equipment_type,
          broker_name: nextMatch.broker_name,
          broker_phone: nextMatch.broker_phone,
          weight: nextMatch.weight,
          match_score: nextMatch.score,
          source: nextMatch.source,
        },
        status: 'sent',
      })
    } catch { /* best effort */ }

    return `🚛 Next Load Match\n${origin} → ${dest}\n${rate} (${rpm}/mi) · ${miles}\n${equip} · Score: ${nextMatch.score}/100\nReply YES ${alertCode} to book or DETAILS ${alertCode} for more`
  } catch (e) {
    console.error('MORE handler error:', e)
    return 'Something went wrong finding more loads. Try again in a moment.'
  }
}

/**
 * Handle STOP — opt out of SMS load alerts.
 */
async function handleStop(phone) {
  if (!supabaseUrl || !serviceKey) {
    return 'You have been unsubscribed from Qivori load alerts. Reply START to re-subscribe.'
  }

  // Update sms_preferences
  try {
    // Find user by phone in sms_preferences
    const prefs = await supabaseQuery('sms_preferences',
      `phone=eq.${encodeURIComponent(phone)}&limit=1`
    )
    if (Array.isArray(prefs) && prefs.length > 0) {
      await supabaseUpdate('sms_preferences',
        `phone=eq.${encodeURIComponent(phone)}`,
        { alerts_enabled: false }
      )
    }
  } catch { /* best effort */ }

  // Also update profiles table
  try {
    await fetch(`${supabaseUrl}/rest/v1/profiles?phone=eq.${encodeURIComponent(phone)}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ sms_opted_out: true }),
    })
  } catch { /* best effort */ }

  return 'You have been unsubscribed from Qivori load alerts. Reply START to re-subscribe anytime.'
}

/**
 * Handle START — opt back in to SMS load alerts.
 */
async function handleStart(phone) {
  if (!supabaseUrl || !serviceKey) {
    return 'Welcome back! You are now subscribed to Qivori load alerts.'
  }

  // Update sms_preferences
  try {
    const prefs = await supabaseQuery('sms_preferences',
      `phone=eq.${encodeURIComponent(phone)}&limit=1`
    )
    if (Array.isArray(prefs) && prefs.length > 0) {
      await supabaseUpdate('sms_preferences',
        `phone=eq.${encodeURIComponent(phone)}`,
        { alerts_enabled: true }
      )
    }
  } catch { /* best effort */ }

  // Also update profiles table
  try {
    await fetch(`${supabaseUrl}/rest/v1/profiles?phone=eq.${encodeURIComponent(phone)}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ sms_opted_out: false }),
    })
  } catch { /* best effort */ }

  return 'Welcome back! You are now subscribed to Qivori load alerts. Reply STOP to unsubscribe.'
}

/**
 * Main entry point — called from sms-webhook.js or directly.
 * Processes an inbound SMS and returns a reply string.
 */
export async function handleLoadReply(phone, body) {
  const parsed = parseLoadCommand(body)
  if (!parsed) return null // not a load command

  switch (parsed.command) {
    case 'YES':
      return handleYes(phone, parsed.alertCode)
    case 'DETAILS':
      return handleDetails(phone, parsed.alertCode)
    case 'MORE':
      return handleMore(phone)
    case 'STOP':
      return handleStop(phone)
    case 'START':
      return handleStart(phone)
    default:
      return null
  }
}

/**
 * Direct HTTP handler — can be called as an API endpoint.
 * POST /api/sms-load-reply with JSON { phone, body }
 * or as a Twilio webhook (form-urlencoded).
 */
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    let phone, body

    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const json = await req.json()
      phone = json.phone || json.From
      body = json.body || json.Body
    } else {
      // Twilio form-encoded
      const text = await req.text()
      const params = new URLSearchParams(text)
      phone = params.get('From')
      body = params.get('Body')
    }

    if (!phone || !body) {
      return Response.json({ ok: false, error: 'Missing phone or body' }, { status: 400 })
    }

    const reply = await handleLoadReply(phone, body)
    if (!reply) {
      return Response.json({ ok: false, error: 'Not a load command' }, { status: 400 })
    }

    // If called directly (not via webhook), send SMS reply
    if (contentType.includes('application/json')) {
      const smsResult = await sendSMS(phone, reply)
      return Response.json({ ok: smsResult.ok, reply, smsResult })
    }

    // If called as Twilio webhook, return TwiML
    const escaped = reply.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
  } catch (error) {
    console.error('SMS load reply error:', error)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
}
