// ═══════════════════════════════════════════════════════════════
// Market Alerts — Cron endpoint (daily)
// Uses Claude Haiku to identify freight market opportunities,
// then pushes notifications to active owner-operators/drivers.
// ═══════════════════════════════════════════════════════════════

export const config = { runtime: 'edge' }

import { sendPush } from './_lib/push.js'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function stripMarkdown(text) {
  return text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()
}

async function getAlertsForState(state, dateStr, dayOfWeek) {
  if (!ANTHROPIC_KEY) return []

  const prompt = `You are Q, a freight market intelligence system. Today is ${dateStr}, ${dayOfWeek}.

Generate 2-3 actionable freight market alerts for truck drivers based in ${state}.

Consider: seasonal produce, automotive, retail inventory cycles, holiday shipping, weather patterns, regional demand shifts.

Return ONLY valid JSON:
{
  "alerts": [
    {
      "title": "Short headline (max 8 words)",
      "body": "Specific opportunity with why and where (max 20 words)",
      "lane": "Origin region → Destination region",
      "urgency": "high|medium|low"
    }
  ]
}

Only include alerts that are genuinely relevant right now. Max 2 alerts. If nothing notable, return {"alerts":[]}.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) return []

    const data = await res.json()
    const raw = data?.content?.[0]?.text || ''
    const cleaned = stripMarkdown(raw)
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed?.alerts) ? parsed.alerts : []
  } catch {
    return []
  }
}

export default async function handler(req) {
  // Auth
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing Supabase config' }), { status: 500 })
  }

  const sbHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  // Date context
  const now = new Date()
  const dateStr = `${MONTH_NAMES[now.getUTCMonth()]} ${now.getUTCDate()}, ${now.getUTCFullYear()}`
  const dayOfWeek = DAY_NAMES[now.getUTCDay()]

  try {
    // Pull active owner-op / driver profiles with push tokens
    const profilesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=id,push_token,home_base_state,home_base_city,equipment_type&push_token=not.is.null&limit=200`,
      { headers: sbHeaders }
    )

    if (!profilesRes.ok) {
      const err = await profilesRes.text()
      return new Response(JSON.stringify({ error: `Supabase error: ${err}` }), { status: 500 })
    }

    const profiles = await profilesRes.json()

    // Filter to owner_op / driver roles — field may not be in the select above,
    // so we fetch role separately or accept all push-token holders as eligible drivers.
    // The query already limits to push_token holders (mobile app users = drivers/OOs).
    // Group profiles by home_base_state
    const byState = {}
    for (const p of profiles) {
      const state = (p.home_base_state || '').trim().toUpperCase()
      if (!state) continue
      if (!byState[state]) byState[state] = []
      byState[state].push(p)
    }

    const uniqueStates = Object.keys(byState).slice(0, 10) // cap at 10 states per run

    let notified = 0
    let alertsGenerated = 0

    for (const state of uniqueStates) {
      const driversInState = byState[state]
      // Skip if no drivers — don't call Claude for empty states
      if (!driversInState.length) continue

      const alerts = await getAlertsForState(state, dateStr, dayOfWeek)
      alertsGenerated += alerts.length

      if (!alerts.length) continue

      // Send each alert as push + write to q_activity feed
      for (const alert of alerts) {
        const urgencyPrefix = alert.urgency === 'high' ? 'High demand: ' : ''
        const pushTitle = `${urgencyPrefix}${alert.title}`
        const pushBody = alert.lane
          ? `${alert.body} · ${alert.lane}`
          : alert.body

        for (const driver of driversInState) {
          const token = driver.push_token
          if (!token) continue

          const { ok } = await sendPush(token, pushTitle, pushBody, {
            screen: 'loads',
            type: 'market_alert',
            state,
            urgency: alert.urgency,
            lane: alert.lane || null,
          })

          if (ok) notified++

          // Write to q_activity so MarketAlertsScreen has a feed to display
          fetch(`${SUPABASE_URL}/rest/v1/q_activity`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              driver_id: driver.id,
              type: 'market_alert',
              content: {
                title: alert.title,
                message: alert.body,
                state,
                urgency: alert.urgency,
                lane: alert.lane || null,
              },
              requires_action: false,
            }),
          }).catch(() => {})
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notified,
        states_checked: uniqueStates.length,
        alerts_generated: alertsGenerated,
        date: dateStr,
        day: dayOfWeek,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
