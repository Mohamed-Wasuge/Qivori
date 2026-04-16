/**
 * POST /api/family-notify
 * Send SMS to a family contact when a load event occurs.
 *
 * Body:
 *   { contactId, event?, loadNumber?, deliveredCity?, estimatedHomeDate? }
 *   OR { test: true, contactId }
 *
 * event values: 'delivered' | 'picked_up' | 'delay' | 'test'
 */

import { verifyAuth, corsHeaders, handleCors } from './_lib/auth.js'
import { sendSMS } from './_lib/sms.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

async function dbGet(table, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}&limit=1`
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) return null
  const rows = await res.json()
  return rows?.[0] || null
}

function buildMessage({ driverName, event, loadNumber, deliveredCity, estimatedHomeDate }) {
  const name = driverName || 'Your driver'
  const load = loadNumber ? ` (Load ${loadNumber})` : ''
  const home = estimatedHomeDate
    ? ` Est. home: ${new Date(estimatedHomeDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}.`
    : ''

  switch (event) {
    case 'picked_up':
      return `Hi! ${name} just picked up a load${load}. They're on the road.${home} - Q`

    case 'delay':
      return `Hi! ${name} has a delay on load${load}.${home ? ` Updated ETA:${home}` : ' No updated ETA yet.'} - Q`

    case 'test':
      return `Hi! This is a test message from Q — ${name}'s trucking assistant. You'll get updates here about deliveries and safe arrivals. - Q`

    case 'delivered':
    default: {
      const city = deliveredCity ? ` in ${deliveredCity}` : ''
      return `Hi! ${name} just delivered${city}${load}.${home} Safe and moving to the next load. - Q`
    }
  }
}

export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders(req) })
  }

  const { contactId, event = 'delivered', loadNumber, deliveredCity, estimatedHomeDate, test } = body

  if (!contactId) {
    return Response.json({ error: 'contactId required' }, { status: 400, headers: corsHeaders(req) })
  }

  // Fetch contact — enforce owner check
  const contact = await dbGet('family_contacts', `id=eq.${contactId}&owner_id=eq.${user.id}`)
  if (!contact) {
    return Response.json({ error: 'Contact not found' }, { status: 404, headers: corsHeaders(req) })
  }

  if (!contact.phone) {
    return Response.json({ error: 'Contact has no phone number' }, { status: 400, headers: corsHeaders(req) })
  }

  // Check the contact's notification toggle for this event (skip for test)
  if (!test) {
    const toggleMap = {
      delivered:  'notify_on_delivery',
      picked_up:  'notify_on_pickup',
      delay:      'notify_on_delay',
    }
    const toggleField = toggleMap[event]
    if (toggleField && contact[toggleField] === false) {
      return Response.json({ ok: true, skipped: true, reason: 'notifications disabled for this event' })
    }
  }

  // Fetch driver name from profiles
  const profile = await dbGet('profiles', `id=eq.${user.id}`)
  const driverName = profile?.full_name || profile?.name || null

  const message = buildMessage({
    driverName,
    event: test ? 'test' : event,
    loadNumber,
    deliveredCity,
    estimatedHomeDate,
  })

  const { messageId, error: smsErr } = await sendSMS(contact.phone, message)

  if (smsErr) {
    console.error('family-notify SMS error:', smsErr)
    return Response.json(
      { ok: false, error: smsErr },
      { status: 502, headers: corsHeaders(req) }
    )
  }

  return Response.json({ ok: true, messageId }, { headers: corsHeaders(req) })
}
