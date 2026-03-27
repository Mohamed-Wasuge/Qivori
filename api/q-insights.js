import { handleCors, corsHeaders, verifyAuth, requireActiveSubscription } from './_lib/auth.js'
import { checkRateLimit, rateLimitResponse } from './_lib/rate-limit.js'
import { sanitizeString } from './_lib/sanitize.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const subErr = await requireActiveSubscription(req, user)
  if (subErr) return subErr

  // Rate limit: 10 insight requests per 5 min per user
  const { limited, resetSeconds } = await checkRateLimit(user.id, 'q-insights', 10, 300)
  if (limited) return rateLimitResponse(req, corsHeaders, resetSeconds)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    let body
    try { body = await req.json() } catch {
      return Response.json({ error: 'Request body must be valid JSON' }, { status: 400, headers: corsHeaders(req) })
    }

    const hub = sanitizeString(body.hub, 50) // compliance | financials | drivers | fleet | dashboard
    const summary = sanitizeString(body.summary, 8000) // pre-summarized metrics from frontend

    if (!hub || !summary) {
      return Response.json({ error: 'Missing required fields: hub, summary' }, { status: 400, headers: corsHeaders(req) })
    }

    const systemPrompt = `You are Q, the AI intelligence engine for Qivori — a trucking TMS platform for owner-operators and small carriers (1-10 trucks).

Your job: analyze the carrier's real-time operational data and return ACTIONABLE insights. Not summaries. Not dashboards. PREDICTIONS and ACTIONS.

Rules:
- Return ONLY valid JSON array (no markdown, no backticks, no explanation)
- Each insight must have a specific action the carrier can take RIGHT NOW
- Be specific with numbers, dates, driver names — never vague
- Prioritize: money at risk > compliance risk > efficiency gains > informational
- Maximum 5 insights, minimum 2
- Use the carrier's actual data — never fabricate numbers
- If data is sparse (new carrier), give onboarding guidance instead of fake predictions

Each insight object:
{
  "id": "unique_short_id",
  "priority": "critical" | "high" | "medium" | "low",
  "type": "prediction" | "action" | "alert" | "optimization",
  "title": "Short headline (under 10 words)",
  "body": "1-2 sentences with specific numbers/names. What's happening and why it matters.",
  "action_label": "Button text (2-4 words) — e.g. 'Create Invoice', 'Schedule Now', 'View Details'",
  "action_type": "navigate" | "sms" | "create_invoice" | "schedule" | "alert",
  "action_target": "tab or entity to navigate to — e.g. 'invoices', 'compliance', 'payroll', 'audit'",
  "icon": "dollar" | "alert" | "truck" | "clock" | "shield" | "user" | "chart" | "zap"
}`

    const userPrompt = `Analyze this ${hub} data for a trucking carrier and return actionable AI insights.

TODAY: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

CARRIER DATA:
${summary}

Return a JSON array of 2-5 insights. Each must be specific to THIS carrier's data. Prioritize items that could lose money or cause compliance issues if ignored.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!res.ok) {
      // Fallback model
      const res2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1200,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })
      if (res2.ok) {
        const data2 = await res2.json()
        const text = data2.content?.[0]?.text || '[]'
        try {
          const insights = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim())
          return Response.json({ insights }, { headers: corsHeaders(req) })
        } catch {
          return Response.json({ insights: [] }, { headers: corsHeaders(req) })
        }
      }
      return Response.json({ error: 'AI temporarily unavailable' }, { status: 502, headers: corsHeaders(req) })
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || '[]'
    try {
      const insights = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim())
      return Response.json({ insights: Array.isArray(insights) ? insights : [] }, { headers: corsHeaders(req) })
    } catch {
      return Response.json({ insights: [] }, { headers: corsHeaders(req) })
    }

  } catch (err) {
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
