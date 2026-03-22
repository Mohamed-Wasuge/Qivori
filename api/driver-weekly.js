import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

/**
 * Weekly P&L summary — generates and sends a concise weekly recap SMS via Twilio.
 *
 * POST with user auth or cron secret.
 * Body: { phone, driver_name, summary_data }
 * summary_data: { revenue, expenses_by_category, loads_completed, avg_rpm, net_profit, top_lanes, prev_week }
 */
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Auth: either user token or cron secret
  const authHeader = req.headers.get('authorization') || ''
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Cron authenticated — proceed
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

    // Cron mode: body.drivers is an array
    // Normal mode: single driver
    const drivers = Array.isArray(body.drivers) ? body.drivers : [body]

    const results = []

    for (const driver of drivers) {
      const { phone, driver_name, summary_data } = driver
      if (!phone || !driver_name || !summary_data) {
        results.push({ driver_name: driver_name || 'unknown', error: 'Missing phone, driver_name, or summary_data' })
        continue
      }

      const summary = await generateWeeklySummary(apiKey, driver_name, summary_data)
      if (!summary) {
        results.push({ driver_name, sent: false, error: 'Failed to generate summary' })
        continue
      }

      const smsResult = await sendSms(twilioSid, twilioAuth, twilioFrom, phone, summary)
      results.push({
        driver_name,
        sent: smsResult.success,
        message: summary,
        error: smsResult.error || null,
      })
    }

    return Response.json({ results }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}

/**
 * Use Claude Haiku to generate a concise weekly P&L summary SMS.
 */
async function generateWeeklySummary(apiKey, driverName, data) {
  const {
    revenue = 0,
    expenses_by_category = {},
    loads_completed = 0,
    avg_rpm = 0,
    net_profit = 0,
    top_lanes = [],
    prev_week = {},
  } = data

  const context = JSON.stringify({
    revenue,
    expenses_by_category,
    loads_completed,
    avg_rpm,
    net_profit,
    top_lanes,
    prev_week,
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
      max_tokens: 512,
      system: `You are Q, the AI dispatch engine inside Qivori. Generate a weekly P&L summary SMS for a truck driver/owner-operator.

Rules:
- Output ONLY the SMS text. No JSON, no explanation.
- 3-5 lines max. Keep it tight — this is an SMS.
- Start with "Weekly wrap, {first_name}:"
- Include: net profit, number of loads, avg RPM.
- Compare to last week if prev_week data exists (% up/down).
- Call out the biggest expense if it's notably high.
- Mention the top-performing lane with its rate.
- End with a motivational one-liner and "— Q"
- Sound like Q — sharp, real, encouraging. Not corporate.
- Use real dollar amounts and percentages from the data.
- No emojis. Clean text only.

Example:
"Weekly wrap, Mohamed: $4,800 net on 6 loads. RPM averaged $2.84 — up 8% from last week. Fuel hit $1,100 though, $200 over your usual. Dallas→Atlanta was your money lane at $3.10/mi. Keep grinding. — Q"

Driver name: ${driverName}`,
      messages: [{ role: 'user', content: `Generate the weekly summary from this data:\n\n${context}` }],
    }),
  })

  if (!res.ok) return null

  const aiData = await res.json()
  const text = aiData.content?.[0]?.text || ''
  return text.trim() || null
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
