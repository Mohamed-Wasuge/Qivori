import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

// ── Signal scoring ────────────────────────────────────────────────────────────

const SIGNAL_SCORES = {
  'willing to increase': 15,
  'willing to increase rate': 15,
  'can come up': 15,
  'deadline pressure': 20,
  'urgent': 20,
  'need it covered today': 20,
  'pickup today': 20,
  'reposted': 25,
  'reposted load': 25,
  'reposted multiple times': 25,
  'posted again': 25,
  'mentioned other carriers': 10,
  'other carriers': 10,
  'shopping around': 10,
  'quick acceptance': 15,
  'accepted quickly': 15,
  'took it fast': 15,
  'flexible on rate': 15,
  'rate is negotiable': 15,
  'can work with you': 10,
  'desperate tone': 20,
  'multiple callbacks': 15,
  'called back': 15,
}

function scoreSignals(signals) {
  if (!signals || !Array.isArray(signals)) return 0
  let total = 0
  for (const signal of signals) {
    const lower = signal.toLowerCase().trim()
    // Check for exact match first
    if (SIGNAL_SCORES[lower]) {
      total += SIGNAL_SCORES[lower]
      continue
    }
    // Partial match
    for (const [key, score] of Object.entries(SIGNAL_SCORES)) {
      if (lower.includes(key) || key.includes(lower)) {
        total += score
        break
      }
    }
  }
  // Cap at 100
  return Math.min(total, 100)
}

// ── Urgency extraction from transcript ────────────────────────────────────────

export function extractUrgencySignals(transcript) {
  if (!transcript) return []
  const lower = transcript.toLowerCase()
  const detected = []

  const patterns = [
    { pattern: /willing to (increase|come up|go higher|bump|raise)/i, signal: 'willing to increase rate' },
    { pattern: /(need.*(covered|picked up|moved).*(today|asap|immediately|now))/i, signal: 'deadline pressure' },
    { pattern: /(urgent|asap|emergency|critical|time.?sensitive)/i, signal: 'deadline pressure' },
    { pattern: /(repost|posted.*again|put.*(back|again).*board)/i, signal: 'reposted load multiple times' },
    { pattern: /(other carrier|another carrier|someone else|shopping)/i, signal: 'mentioned other carriers' },
    { pattern: /(take it|book it|let'?s do it|deal|sounds good|works for me)/i, signal: 'quick acceptance' },
    { pattern: /(flexible|negotiable|work with you|meet.*middle)/i, signal: 'flexible on rate' },
    { pattern: /(call.*(back|again)|follow.?up|reaching out again)/i, signal: 'multiple callbacks' },
    { pattern: /(pickup today|deliver.*(today|tomorrow morning))/i, signal: 'pickup today' },
  ]

  for (const { pattern, signal } of patterns) {
    if (pattern.test(lower) && !detected.includes(signal)) {
      detected.push(signal)
    }
  }

  return detected
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json()
    const { broker_name, transcript_summary, signals: rawSignals } = body

    if (!broker_name) {
      return Response.json({ error: 'Missing broker_name' }, { status: 400, headers: corsHeaders(req) })
    }

    // Build signals list: use provided signals, or extract from transcript
    let signals = rawSignals || []
    if ((!signals || signals.length === 0) && transcript_summary) {
      signals = extractUrgencySignals(transcript_summary)
    }

    // Score the new signals
    const newScore = scoreSignals(signals)

    // Fetch existing score
    let existingScore = 50
    let existingCallCount = 0
    let existingSignals = []

    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/broker_urgency_scores?owner_id=eq.${user.id}&broker_name=eq.${encodeURIComponent(broker_name)}&select=*&limit=1`,
        { headers: sbHeaders() }
      )
      if (res.ok) {
        const rows = await res.json()
        if (rows?.[0]) {
          existingScore = rows[0].urgency_score || 50
          existingCallCount = rows[0].call_count || 0
          existingSignals = rows[0].signals || []
        }
      }
    } catch {}

    // Weighted average: 60% new, 40% existing
    const finalScore = Math.round(newScore * 0.6 + existingScore * 0.4)
    const mergedSignals = [...new Set([...existingSignals, ...signals])].slice(-20) // Keep last 20

    // Upsert into broker_urgency_scores
    const record = {
      owner_id: user.id,
      broker_name,
      urgency_score: Math.min(finalScore, 100),
      signals: mergedSignals,
      call_count: existingCallCount + 1,
      last_call_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    await fetch(`${SUPABASE_URL}/rest/v1/broker_urgency_scores`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(record),
    })

    return Response.json({
      ok: true,
      broker_name,
      urgency_score: record.urgency_score,
      signals: mergedSignals,
      call_count: record.call_count,
    }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Failed: ' + (err.message || 'unknown') }, { status: 500, headers: corsHeaders(req) })
  }
}
