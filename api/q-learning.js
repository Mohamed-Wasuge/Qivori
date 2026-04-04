// ═══════════════════════════════════════════════════════════════════════════════
// Q LEARNING — Self-improvement loop API
// POST /api/q-learning { action: 'record_outcome' | 'run_feedback' | 'daily_summary' | 'dashboard' }
// ═══════════════════════════════════════════════════════════════════════════════

import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
import {
  processLoadOutcome,
  runFeedbackCycle,
  generateDailySummary,
  getLearningDashboard,
  recordLoadOutcome,
  detectMistakes,
  updateLanePerformance,
  updateBrokerPerformance,
} from './_lib/q-learning.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  try {
    const body = await req.json()
    const action = body.action

    switch (action) {

      // ── Record a load outcome (called when load reaches Delivered/Paid) ──
      case 'record_outcome': {
        if (!body.loadData || !body.decisionData) {
          return json({ error: 'loadData and decisionData required' }, 400)
        }
        const result = await processLoadOutcome(user.id, body.loadData, body.decisionData)
        return json(result)
      }

      // ── Run feedback cycle (analyze outcomes → propose/apply adjustments) ──
      case 'run_feedback': {
        const result = await runFeedbackCycle(user.id)
        return json(result)
      }

      // ── Generate daily summary ──
      case 'daily_summary': {
        const result = await generateDailySummary(user.id, body.date)
        return json(result)
      }

      // ── Get learning dashboard data for UI ──
      case 'dashboard': {
        const result = await getLearningDashboard(user.id)
        return json(result)
      }

      default:
        return json({
          error: `Unknown action: ${action}. Valid: record_outcome, run_feedback, daily_summary, dashboard`,
        }, 400)
    }
  } catch (err) {
    console.error('[q-learning] Error:', err.message)
    return json({ error: err.message }, 500)
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
