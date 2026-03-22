import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

/**
 * Proactive notification API — analyzes driver data and sends SMS alerts via Twilio.
 *
 * POST with user auth:  { user_id, phone, driver_name, alerts_data }
 * POST with cron secret: Authorization: Bearer <CRON_SECRET>  (batch mode, body has array of drivers)
 */
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Auth: either user token or cron secret
  let isCron = false
  const authHeader = req.headers.get('authorization') || ''
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    isCron = true
  } else {
    const { user, error: authError } = await verifyAuth(req)
    if (authError) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  const twilioSid = process.env.TWILIO_ACCOUNT_SID
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER
  if (!twilioSid || !twilioAuth || !twilioFrom) {
    return Response.json({ error: 'Twilio not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json().catch(() => ({}))

    // Cron mode: body.drivers is an array of driver objects
    // Normal mode: single driver in body
    const drivers = isCron && Array.isArray(body.drivers)
      ? body.drivers
      : [body]

    const results = []

    for (const driver of drivers) {
      const { phone, driver_name, alerts_data } = driver
      if (!phone || !driver_name || !alerts_data) {
        results.push({ driver_name: driver_name || 'unknown', error: 'Missing phone, driver_name, or alerts_data' })
        continue
      }

      const alerts = await generateAlerts(apiKey, driver_name, alerts_data)
      if (!alerts.length) {
        results.push({ driver_name, alerts_sent: 0 })
        continue
      }

      const sent = []
      for (const alert of alerts) {
        const smsResult = await sendSms(twilioSid, twilioAuth, twilioFrom, phone, alert)
        sent.push({ message: alert, success: smsResult.success, error: smsResult.error || null })
      }

      results.push({ driver_name, alerts_sent: sent.filter(s => s.success).length, details: sent })
    }

    return Response.json({ results }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}

/**
 * Use Claude Haiku to analyze driver data and generate 0-3 proactive alerts.
 */
async function generateAlerts(apiKey, driverName, data) {
  const {
    active_loads = [],
    invoices = [],
    expenses = [],
    total_revenue = 0,
    memories = [],
  } = data

  // Build context snapshot for Claude
  const context = JSON.stringify({
    active_loads,
    invoices,
    expenses,
    total_revenue,
    memories,
    today: new Date().toISOString().split('T')[0],
  })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `You are Q, the AI dispatch engine inside Qivori. Analyze the driver's current data and generate 0-3 proactive SMS alerts. Each alert should be a single short SMS message (under 160 chars if possible, max 300 chars).

Alert types to check:
1. OVERDUE INVOICE — Any invoice unpaid 30+ days. Example: "Hey {name}, your $3,200 invoice to ABC Logistics is 34 days unpaid. Want me to chase them?"
2. RATE SPIKE — If driver has preferred lanes in memories and market data suggests opportunity. Example: "Rate alert: Dallas→Atlanta hitting $3.10/mi — 18% above your average."
3. DELIVERY APPROACHING — Load with delivery date within 24 hours. Example: "You're delivering to {dest} tomorrow. I'm already looking at reloads."
4. EXPENSE ANOMALY — This week's fuel expenses are 30%+ above their weekly average. Example: "Heads up — fuel spending is up 35% this week. Might want to check routes."

Rules:
- Output ONLY a JSON array of strings (the SMS messages). No explanation.
- Use the driver's first name naturally.
- Sound like Q — sharp, direct, helpful. Not robotic.
- If nothing actionable, return [].
- Max 3 alerts. Prioritize by urgency/impact.
- Include specific numbers ($amounts, days, percentages) from the data.
- End alerts with a call-to-action or offer to help.
- Sign off with "— Q" on each message.

Driver name: ${driverName}`,
      messages: [{ role: 'user', content: `Analyze this driver data and generate alerts:\n\n${context}` }],
    }),
  })

  if (!res.ok) return []

  const aiData = await res.json()
  const text = aiData.content?.[0]?.text || '[]'

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const alerts = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    // Ensure it's an array of strings, max 3
    return alerts.filter(a => typeof a === 'string').slice(0, 3)
  } catch {
    return []
  }
}

/**
 * Send an SMS via Twilio REST API (no SDK).
 */
async function sendSms(sid, authToken, from, to, message) {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${sid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: message }),
    })

    if (!res.ok) {
      const err = await res.text()
      return { success: false, error: err }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
