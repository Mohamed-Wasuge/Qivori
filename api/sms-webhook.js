import { sendSMS } from './_lib/sms.js'

export const config = { runtime: 'edge' }

/**
 * Twilio inbound SMS webhook handler.
 * Receives incoming SMS messages from Twilio (form-urlencoded POST).
 *
 * - "STOP" → opts the user out of SMS
 * - "START" → opts the user back in
 * - Anything else → forwards to Claude AI for a short SMS reply
 *
 * Also handles delivery status callbacks when ?type=status is present.
 *
 * Responds with TwiML XML.
 */

const TWIML_HEADER = { 'Content-Type': 'text/xml' }

/**
 * Validate Twilio request signature (HMAC-SHA1).
 * Returns true if the signature is valid or if TWILIO_AUTH_TOKEN is not set (dev mode).
 */
async function validateTwilioSignature(req, url, params) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    // Dev mode — skip validation when auth token is not configured
    return true
  }

  const signature = req.headers.get('x-twilio-signature')
  if (!signature) return false

  // Build the validation URL: full URL + sorted POST params appended as key+value
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host
  const validationUrl = `${proto}://${host}${url.pathname}${url.search}`

  // Sort params alphabetically by key and append key+value to URL
  const sortedKeys = [...params.keys()].sort()
  let dataString = validationUrl
  for (const key of sortedKeys) {
    dataString += key + params.get(key)
  }

  // Compute HMAC-SHA1
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(dataString))
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))

  return expectedSignature === signature
}

function twiml(message) {
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
    { status: 200, headers: TWIML_HEADER }
  )
}

function twimlEmpty() {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { status: 200, headers: TWIML_HEADER }
  )
}

/**
 * Update opt-out/opt-in status in the profiles table.
 */
async function setOptOut(phone, optedOut) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) return

  try {
    await fetch(
      `${supabaseUrl}/rest/v1/profiles?phone=eq.${encodeURIComponent(phone)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ sms_opted_out: optedOut }),
      }
    )
  } catch {
    // Best-effort
  }
}

/**
 * Log an inbound SMS to the sms_notifications table.
 */
async function logInbound(from, body, messageSid) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) return

  try {
    await fetch(`${supabaseUrl}/rest/v1/sms_notifications`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        user_id: 'inbound',
        event_type: 'inbound_sms',
        phone: from,
        message: body,
        sid: messageSid,
        sent_at: new Date().toISOString(),
      }),
    })
  } catch {
    // Best-effort
  }
}

/**
 * Handle delivery status callback from Twilio.
 */
async function handleStatusCallback(params) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) return

  const sid = params.get('MessageSid')
  const status = params.get('MessageStatus') // queued, sent, delivered, undelivered, failed
  if (!sid || !status) return

  try {
    await fetch(
      `${supabaseUrl}/rest/v1/sms_notifications?sid=eq.${encodeURIComponent(sid)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          delivery_status: status,
          delivery_updated_at: new Date().toISOString(),
        }),
      }
    )
  } catch {
    // Best-effort
  }
}

/**
 * Get an AI response for a conversational SMS using the Claude API.
 * Uses a shorter system prompt optimized for SMS context.
 */
async function getAIReply(userMessage, fromPhone) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const systemPrompt = `You are Qivori AI, a smart trucking assistant that responds via SMS.
Keep responses VERY short (under 160 characters when possible, max 320 characters).
You help owner-operators with quick questions about loads, rates, compliance, and trucking.
Be direct, helpful, and use trucker-friendly language. No markdown formatting.
If someone needs detailed help, tell them to open the Qivori app at qivori.com.
Reply STOP to unsubscribe from messages.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!res.ok) {
      // Try fallback model
      const res2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      })
      if (res2.ok) {
        const data = await res2.json()
        return data.content?.[0]?.text || null
      }
      return null
    }

    const data = await res.json()
    return data.content?.[0]?.text || null
  } catch {
    return null
  }
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const url = new URL(req.url)

    // Parse form-urlencoded body from Twilio
    const bodyText = await req.text()
    const params = new URLSearchParams(bodyText)

    // Validate Twilio signature
    const isValid = await validateTwilioSignature(req, url, params)
    if (!isValid) {
      return new Response('Forbidden', { status: 403 })
    }

    // Handle delivery status callbacks
    if (url.searchParams.get('type') === 'status') {
      await handleStatusCallback(params)
      return twimlEmpty()
    }

    // Inbound SMS fields
    const from = params.get('From') || ''
    const body = (params.get('Body') || '').trim()
    const messageSid = params.get('MessageSid') || ''

    if (!from || !body) {
      return twimlEmpty()
    }

    // Log the inbound message
    await logInbound(from, body, messageSid)

    const upperBody = body.toUpperCase()

    // Handle STOP (opt-out)
    if (upperBody === 'STOP' || upperBody === 'STOPALL' || upperBody === 'UNSUBSCRIBE' || upperBody === 'CANCEL' || upperBody === 'END' || upperBody === 'QUIT') {
      await setOptOut(from, true)
      return twiml('You have been unsubscribed from Qivori SMS notifications. Reply START to re-subscribe.')
    }

    // Handle START (opt-in)
    if (upperBody === 'START' || upperBody === 'YES' || upperBody === 'UNSTOP') {
      await setOptOut(from, false)
      return twiml('Welcome back! You are now subscribed to Qivori SMS notifications. Reply STOP to unsubscribe.')
    }

    // Handle HELP
    if (upperBody === 'HELP' || upperBody === 'INFO') {
      return twiml('Qivori AI - Trucking assistant. Reply with any question about loads, rates, or compliance. STOP to unsubscribe. Visit qivori.com')
    }

    // Forward to AI for a response
    const aiReply = await getAIReply(body, from)
    if (aiReply) {
      return twiml(aiReply)
    }

    // Fallback if AI is unavailable
    return twiml('Thanks for your message! Open the Qivori app for full AI dispatch: qivori.com. Reply STOP to unsubscribe.')
  } catch {
    return twimlEmpty()
  }
}
