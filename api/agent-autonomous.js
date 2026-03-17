/**
 * Qivori Autonomous AI Agent
 * Runs every hour via Vercel cron. Analyzes all platform data using Claude
 * and takes autonomous actions (emails, alerts, status updates, escalations).
 */

import { sendEmail, sendAdminEmail, sendAdminSMS, logEmail, wasEmailSent } from './_lib/emails.js'

export const config = { runtime: 'edge' }

// ── Supabase helpers ──

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = () => process.env.SUPABASE_SERVICE_KEY

function supabaseHeaders(method = 'GET') {
  const key = supabaseKey()
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` }
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    headers['Prefer'] = 'return=minimal'
  }
  return headers
}

async function supabaseGet(path) {
  const res = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    headers: supabaseHeaders(),
  })
  if (!res.ok) throw new Error(`Supabase GET ${path} failed: ${res.status}`)
  return res.json()
}

async function supabaseInsert(table, data) {
  const res = await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: supabaseHeaders('POST'),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Supabase INSERT ${table} failed: ${res.status}`)
}

async function supabaseUpdate(table, filters, data) {
  const res = await fetch(`${supabaseUrl()}/rest/v1/${table}?${filters}`, {
    method: 'PATCH',
    headers: supabaseHeaders('PATCH'),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Supabase UPDATE ${table} failed: ${res.status}`)
}

// ── Auth ──

function isAuthorized(req) {
  const authHeader = req.headers.get('authorization') || ''
  const serviceKey = req.headers.get('x-service-key') || ''
  const cronSecret = process.env.CRON_SECRET
  const svcKey = process.env.SUPABASE_SERVICE_KEY

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  if (svcKey && serviceKey === svcKey) return true
  return false
}

// ── System prompt for Claude ──

const SYSTEM_PROMPT = `You are the Qivori Autonomous Agent — the AI brain behind Qivori, an AI-powered TMS (Transportation Management System) SaaS for trucking owner-operators.

Your job: analyze all platform data and make decisions. You run every hour.

For each issue you find, produce a decision object with:
- category: one of "trial_management", "churn_prevention", "load_operations", "revenue", "compliance", "system_health", "engagement"
- priority: "critical" | "high" | "medium" | "low"
- title: short description (under 80 chars)
- analysis: 1-3 sentence explanation of what you found
- recommendation: what should be done
- confidence: 0.0 to 1.0
- auto_actionable: boolean — true ONLY for medium/low priority items you can safely handle

For auto_actionable items, also include an action object:
- type: "email_sent" | "alert_sent" | "status_update" | "notification"
- details: object with the specifics (e.g., { to, subject, body } for email_sent, { load_id, new_status } for status_update)

ESCALATION RULES — strictly follow these:
NEVER: delete any data, charge or refund customers, send mass emails (>5 at once), change pricing, share user PII externally
CAN: send individual emails, send admin alerts/SMS, update individual load statuses, send push notifications, log events

For critical or high priority items, add them to the escalations array so the admin is notified via SMS.

Return ONLY valid JSON (no markdown, no code fences) with this structure:
{
  "decisions": [ { category, priority, title, analysis, recommendation, confidence, auto_actionable } ],
  "actions": [ { type, details, decision_index } ],
  "escalations": [ { title, priority, details } ],
  "summary": "1-2 sentence overall summary"
}`

// ── Data gathering ──

async function gatherPlatformData() {
  const [profiles, loads, revenueEvents, invoices, drivers, notifications, agentRuns, escalations] =
    await Promise.all([
      supabaseGet('profiles?select=id,email,full_name,role,subscription_status,plan,trial_ends_at,last_login,created_at'),
      supabaseGet('loads?select=*&order=created_at.desc&limit=200'),
      supabaseGet('revenue_events?select=*&order=created_at.desc&limit=100'),
      supabaseGet('invoices?select=*&order=created_at.desc&limit=100'),
      supabaseGet('drivers?select=*'),
      supabaseGet('notifications?select=*&created_at=gt.now()-interval.24.hours'),
      supabaseGet('agent_runs?select=*&order=started_at.desc&limit=5'),
      supabaseGet('agent_escalations?select=*&status=eq.pending'),
    ])

  return { profiles, loads, revenueEvents, invoices, drivers, notifications, agentRuns, escalations }
}

// ── Build data summary for Claude ──

function buildDataSummary(data) {
  const { profiles, loads, revenueEvents, invoices, drivers, notifications, agentRuns, escalations } = data
  const now = new Date()

  // User segmentation
  const activeUsers = profiles.filter(p => p.subscription_status === 'active')
  const trialUsers = profiles.filter(p => p.subscription_status === 'trialing')
  const expiringSoon = trialUsers.filter(p => {
    if (!p.trial_ends_at) return false
    const daysLeft = (new Date(p.trial_ends_at) - now) / (1000 * 60 * 60 * 24)
    return daysLeft >= 0 && daysLeft <= 3
  })
  const dormantUsers = profiles.filter(p => {
    if (!p.last_login) return true
    return (now - new Date(p.last_login)) / (1000 * 60 * 60 * 24) > 7
  })

  // Load stats
  const loadsByStatus = {}
  loads.forEach(l => { loadsByStatus[l.status] = (loadsByStatus[l.status] || 0) + 1 })

  // Revenue
  const totalRevenue = revenueEvents.reduce((sum, e) => sum + (e.amount_cents || 0), 0)
  const unpaidInvoices = invoices.filter(i => i.status === 'unpaid' || i.status === 'overdue')

  const lines = [
    `=== QIVORI PLATFORM DATA — ${now.toISOString()} ===`,
    ``,
    `--- USERS (${profiles.length} total) ---`,
    `Active subscribers: ${activeUsers.length}`,
    `Trial users: ${trialUsers.length}`,
    `Trials expiring in <=3 days: ${expiringSoon.length}`,
    `Dormant users (no login >7d): ${dormantUsers.length}`,
    ``,
    `Trial users expiring soon:`,
    ...expiringSoon.map(u => `  - ${u.full_name || u.email} (${u.email}) — trial ends ${u.trial_ends_at}`),
    ``,
    `Dormant users:`,
    ...dormantUsers.slice(0, 20).map(u => `  - ${u.full_name || u.email} (${u.email}) — last login: ${u.last_login || 'never'}, status: ${u.subscription_status}`),
    ``,
    `--- LOADS (${loads.length} recent) ---`,
    `By status: ${JSON.stringify(loadsByStatus)}`,
    `Recent loads:`,
    ...loads.slice(0, 10).map(l => `  - ${l.id?.slice(0,8)} | ${l.origin_city || '?'} -> ${l.destination_city || '?'} | ${l.status} | $${l.rate || 0} | ${l.created_at}`),
    ``,
    `--- REVENUE ---`,
    `Recent revenue events: ${revenueEvents.length}`,
    `Total (recent): $${(totalRevenue / 100).toFixed(2)}`,
    `Unpaid/overdue invoices: ${unpaidInvoices.length}`,
    ...unpaidInvoices.slice(0, 10).map(i => `  - Invoice ${i.id?.slice(0,8)} | ${i.email || i.user_id?.slice(0,8)} | $${((i.amount_cents || i.total || 0) / 100).toFixed(2)} | ${i.status}`),
    ``,
    `--- DRIVERS (${drivers.length}) ---`,
    ...drivers.slice(0, 10).map(d => `  - ${d.name || d.full_name || d.id?.slice(0,8)} | status: ${d.status || 'unknown'}`),
    ``,
    `--- NOTIFICATIONS (last 24h): ${notifications.length} ---`,
    ``,
    `--- AGENT HISTORY ---`,
    `Previous runs: ${agentRuns.length}`,
    ...agentRuns.map(r => `  - ${r.run_id} | ${r.started_at} | decisions: ${r.decisions_made || 0} | actions: ${r.actions_taken || 0}`),
    `Pending escalations: ${escalations.length}`,
    ...escalations.map(e => `  - ${e.title} | ${e.priority} | created: ${e.created_at}`),
    ``,
    `--- FULL USER LIST ---`,
    ...profiles.map(u => `  ${u.email} | ${u.full_name || 'N/A'} | ${u.subscription_status} | ${u.plan || 'none'} | login: ${u.last_login || 'never'} | joined: ${u.created_at}`),
    ``,
    `Analyze this data. Identify issues, opportunities, and risks. Generate decisions and actions.`,
  ]

  return lines.join('\n')
}

// ── Call Claude API ──

async function callClaude(dataSummary) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: dataSummary }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown')
    throw new Error(`Claude API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text || ''

  // Parse JSON — handle possible code fences just in case
  const cleaned = text.replace(/^```json?\s*/m, '').replace(/```\s*$/m, '').trim()
  return JSON.parse(cleaned)
}

// ── Execute actions ──

async function executeAction(action, data) {
  const result = { type: action.type, status: 'completed', details: {} }

  try {
    switch (action.type) {
      case 'email_sent': {
        const { to, subject, body } = action.details || {}
        if (!to || !subject || !body) {
          result.status = 'skipped'
          result.details = { reason: 'missing email fields' }
          break
        }
        const emailRes = await sendEmail(to, subject, body)
        result.details = { to, subject, ok: emailRes?.ok }

        // Log email to prevent duplicates
        const user = data.profiles.find(p => p.email === to)
        if (user) {
          await logEmail(user.id, to, `agent_${action.type}`, { subject }).catch(() => {})
        }
        break
      }

      case 'alert_sent': {
        const { channel, message, subject } = action.details || {}
        if (channel === 'sms' || !channel) {
          await sendAdminSMS(message || subject || 'Agent alert')
        }
        if (channel === 'email' || !channel) {
          await sendAdminEmail(subject || 'Agent Alert', message || '')
        }
        result.details = { channel: channel || 'both', message: message?.slice(0, 100) }
        break
      }

      case 'status_update': {
        const { load_id, new_status } = action.details || {}
        if (!load_id || !new_status) {
          result.status = 'skipped'
          result.details = { reason: 'missing load_id or new_status' }
          break
        }
        await supabaseUpdate('loads', `id=eq.${load_id}`, { status: new_status })
        result.details = { load_id, new_status }
        break
      }

      default: {
        // Log unknown action types without executing
        result.status = 'logged'
        result.details = { type: action.type, note: 'Action type not implemented, logged only' }
        break
      }
    }
  } catch (err) {
    result.status = 'failed'
    result.details = { error: err.message }
  }

  return result
}

// ── Save results to Supabase ──

async function saveDecisions(runId, decisions) {
  for (const d of decisions) {
    await supabaseInsert('agent_decisions', {
      run_id: runId,
      category: d.category,
      priority: d.priority,
      title: d.title,
      analysis: d.analysis,
      recommendation: d.recommendation,
      confidence: d.confidence,
      auto_actionable: d.auto_actionable,
    }).catch(() => {})
  }
}

async function saveActions(runId, actions) {
  for (const a of actions) {
    await supabaseInsert('agent_actions', {
      run_id: runId,
      action_type: a.type,
      status: a.result?.status || 'unknown',
      details: a.result?.details || {},
    }).catch(() => {})
  }
}

async function handleEscalations(runId, escalations) {
  for (const e of escalations) {
    await supabaseInsert('agent_escalations', {
      run_id: runId,
      title: e.title,
      priority: e.priority,
      details: typeof e.details === 'string' ? e.details : JSON.stringify(e.details || {}),
      status: 'pending',
    }).catch(() => {})

    // SMS the admin for critical/high escalations
    const msg = `[Qivori Agent] ${e.priority?.toUpperCase()}: ${e.title}`
    await sendAdminSMS(msg).catch(() => {})
  }
}

async function saveRun(runId, summary, decisionsCount, actionsCount, status, errorMsg = null) {
  await supabaseInsert('agent_runs', {
    run_id: runId,
    started_at: new Date().toISOString(),
    status,
    summary: summary || '',
    decisions_made: decisionsCount,
    actions_taken: actionsCount,
    error: errorMsg,
  }).catch(() => {})
}

// ── Main handler ──

export default async function handler(req) {
  const runId = `run-${Date.now()}`

  // Auth check
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verify required env vars
  if (!supabaseUrl() || !supabaseKey()) {
    return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // 1. Gather all platform data
    const data = await gatherPlatformData()

    // 2. Build summary for Claude
    const dataSummary = buildDataSummary(data)

    // 3. Call Claude for analysis
    let analysis
    try {
      analysis = await callClaude(dataSummary)
    } catch (err) {
      // Claude failed — log and return partial result
      await saveRun(runId, `Claude API failed: ${err.message}`, 0, 0, 'error', err.message)
      await sendAdminSMS(`[Qivori Agent] Claude API failed: ${err.message}`).catch(() => {})
      return new Response(JSON.stringify({
        run_id: runId,
        status: 'error',
        error: `Claude analysis failed: ${err.message}`,
        data_gathered: true,
        users: data.profiles.length,
        loads: data.loads.length,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const decisions = analysis.decisions || []
    const actions = analysis.actions || []
    const escalations = analysis.escalations || []
    const summary = analysis.summary || 'No summary provided'

    // 4. Save all decisions
    await saveDecisions(runId, decisions)

    // 5. Execute auto-actionable items
    const actionResults = []
    for (const action of actions) {
      const result = await executeAction(action, data)
      actionResults.push({ ...action, result })
    }

    // 6. Save action results
    await saveActions(runId, actionResults)

    // 7. Handle escalations (insert + SMS admin)
    await handleEscalations(runId, escalations)

    // 8. Save the run record
    await saveRun(runId, summary, decisions.length, actionResults.length, 'completed')

    // 9. Return results
    return new Response(JSON.stringify({
      run_id: runId,
      status: 'completed',
      summary,
      decisions_count: decisions.length,
      actions_count: actionResults.length,
      escalations_count: escalations.length,
      decisions: decisions.map(d => ({ priority: d.priority, category: d.category, title: d.title })),
      actions: actionResults.map(a => ({ type: a.type, status: a.result?.status })),
      escalations: escalations.map(e => ({ priority: e.priority, title: e.title })),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    await saveRun(runId, `Fatal error: ${err.message}`, 0, 0, 'error', err.message).catch(() => {})
    return new Response(JSON.stringify({
      run_id: runId,
      status: 'error',
      error: err.message,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
