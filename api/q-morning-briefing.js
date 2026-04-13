/**
 * POST /api/q-morning-briefing
 * Claude generates a personalized daily briefing for the driver/owner.
 * Called by HomeScreen on mount each morning (cached 4h in profiles).
 *
 * Returns: { greeting, lines: string[], tip, mood }
 * Runtime: Edge
 */

import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL  = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY

async function sb(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  return r.ok ? r.json() : []
}

export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

  if (!ANTHROPIC_KEY) {
    return Response.json({
      greeting: 'Good morning',
      lines: ["I'm ready to find you a load.", 'Go online to start earning.'],
      tip: null, mood: 'ready',
    }, { headers: corsHeaders(req) })
  }

  const body = await req.json().catch(() => ({}))
  const { name = 'Driver', role = 'owner_op' } = body

  // Pull context: this week's earnings, active load, HOS, pending decisions
  let weekEarnings = 0, activeLoad = null, pendingDecisions = 0, loadsThisWeek = 0

  try {
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)

    const [loads, decisions] = await Promise.all([
      sb(`loads?owner_id=eq.${user.id}&created_at=gte.${weekStart.toISOString()}&select=rate,gross_pay,status,origin,destination`),
      sb(`q_activity?driver_id=eq.${user.id}&requires_action=eq.true&type=eq.decision_needed&created_at=gte.${weekStart.toISOString()}&select=id`),
    ])

    if (Array.isArray(loads)) {
      weekEarnings = loads.reduce((s, l) => s + Number(l.rate || l.gross_pay || 0), 0)
      loadsThisWeek = loads.filter(l => ['Delivered', 'delivered'].includes(l.status)).length
      activeLoad = loads.find(l => ['En Route', 'en_route', 'Dispatched', 'dispatched', 'Loaded', 'loaded'].includes(l.status))
    }
    if (Array.isArray(decisions)) pendingDecisions = decisions.length
  } catch {}

  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const isWeekend = [0, 6].includes(new Date().getDay())

  const prompt = `You are Q, an AI freight dispatcher speaking directly to a truck driver named ${name}.
Generate a short, personal briefing for their ${timeOfDay}.

CONTEXT:
- Name: ${name}
- Role: ${role === 'driver' ? 'company driver' : 'owner-operator'}
- Time: ${timeOfDay}${isWeekend ? ' (weekend)' : ''}
- Earnings this week: $${weekEarnings.toLocaleString()}
- Completed loads this week: ${loadsThisWeek}
- Active load right now: ${activeLoad ? `${activeLoad.origin} → ${activeLoad.destination}` : 'none'}
- Pending decisions waiting: ${pendingDecisions}

Return ONLY this JSON (no markdown, no extra text):
{
  "greeting": "Good ${timeOfDay}, ${name}",
  "lines": ["line 1 (max 12 words)", "line 2 (max 12 words)"],
  "tip": "One practical tip for today (max 15 words) or null",
  "mood": "ready|hunting|on_route|great_week|slow_week"
}

Rules:
- Max 2 lines total. Tight and direct. No filler.
- If earnings > $3000: acknowledge the strong week
- If active load: mention it ("You're on the road to [dest]")
- If pending decisions > 0: "You have a broker offer waiting"
- If weekend + no load: suggest relaxing or prepping for Monday
- mood: "on_route" if active load, "great_week" if earnings > weekly goal, "hunting" if online+searching, "ready" default
- Sound human. Never say "I am an AI". Max 2 short sentences in lines array.`

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
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) throw new Error(`Claude ${res.status}`)

    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)

    return Response.json(parsed, {
      headers: {
        ...corsHeaders(req),
        'Cache-Control': 'private, max-age=14400', // 4h
      },
    })
  } catch (err) {
    console.error('[q-morning-briefing]', err)
    // Graceful fallback — never crash the home screen
    const hour2 = new Date().getHours()
    const greet = hour2 < 12 ? 'Good morning' : hour2 < 17 ? 'Good afternoon' : 'Good evening'
    return Response.json({
      greeting: `${greet}, ${name}`,
      lines: [
        weekEarnings > 0 ? `$${weekEarnings.toLocaleString()} earned so far this week.` : "Ready to find your next load.",
        activeLoad ? `You're on the road to ${activeLoad.destination}.` : "Go online to start earning.",
      ],
      tip: null,
      mood: activeLoad ? 'on_route' : 'ready',
    }, { headers: corsHeaders(req) })
  }
}
