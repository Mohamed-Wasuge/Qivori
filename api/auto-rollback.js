/**
 * Qivori Auto-Rollback System
 * Runs every 10 minutes via Vercel cron.
 * 1. Calls health-check endpoint to get system status
 * 2. If overall status is 'red' for 2+ consecutive checks, triggers rollback
 * 3. Uses Vercel API to promote last known-good deployment
 * 4. Sends admin alert via email + SMS
 * 5. Logs all decisions to system_health_log table
 *
 * Safety: max 1 rollback per hour, never crashes on missing env vars.
 */
import { handleCors, corsHeaders } from './_lib/auth.js'
import { sendAdminEmail, sendAdminSMS } from './_lib/emails.js'

export const config = { runtime: 'edge' }

const ROLLBACK_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour
const CONSECUTIVE_RED_THRESHOLD = 2

// ── Supabase helpers ──
function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  return { url, key }
}

function supabaseHeaders(method = 'GET') {
  const { key } = getSupabaseConfig()
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` }
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    headers['Prefer'] = 'return=minimal'
  }
  return headers
}

async function supabaseGet(path) {
  const { url } = getSupabaseConfig()
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: supabaseHeaders() })
  if (!res.ok) throw new Error(`Supabase GET ${path} failed: ${res.status}`)
  return res.json()
}

async function supabaseInsert(table, data) {
  const { url } = getSupabaseConfig()
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: supabaseHeaders('POST'),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Supabase INSERT ${table} failed: ${res.status}`)
}

// ── Auth ──
function isAuthorized(req) {
  const authHeader = req.headers.get('authorization') || ''
  const serviceKey = req.headers.get('x-service-key') || ''
  const cronSecret = process.env.CRON_SECRET
  const svcKey = process.env.SUPABASE_SERVICE_KEY

  // NEVER compare undefined === undefined — always check that the secret exists first
  if (!authHeader && !serviceKey) return false
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  if (svcKey && serviceKey === svcKey) return true
  return false
}

// ── Health check ──
async function fetchHealthStatus(req) {
  const baseUrl = req.url ? new URL(req.url).origin : 'https://qivori.com'
  try {
    const res = await fetch(`${baseUrl}/api/health-check`, {
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return { status: 'red', error: `HTTP ${res.status}` }
    return await res.json()
  } catch (err) {
    return { status: 'red', error: err.message }
  }
}

// ── Consecutive red check count from system_health_log ──
async function getConsecutiveRedCount() {
  try {
    const rows = await supabaseGet(
      'system_health_log?order=created_at.desc&limit=10&select=overall_status'
    )
    let count = 0
    for (const row of rows) {
      if (row.overall_status === 'red') count++
      else break
    }
    return count
  } catch {
    return 0
  }
}

// ── Cooldown check — was there a rollback in the last hour? ──
async function wasRollbackRecent() {
  try {
    const cutoff = new Date(Date.now() - ROLLBACK_COOLDOWN_MS).toISOString()
    const rows = await supabaseGet(
      `system_health_log?action=eq.rollback&created_at=gte.${cutoff}&select=id&limit=1`
    )
    return rows.length > 0
  } catch {
    return false
  }
}

// ── Vercel deployment rollback ──
async function rollbackToLastGoodDeployment() {
  const vercelToken = process.env.VERCEL_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID

  if (!vercelToken || !projectId) {
    return { success: false, reason: 'VERCEL_TOKEN or VERCEL_PROJECT_ID not configured' }
  }

  try {
    // Get recent deployments (ready state only = successful builds)
    const deploymentsRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&state=READY&limit=10`,
      { headers: { 'Authorization': `Bearer ${vercelToken}` } }
    )
    if (!deploymentsRes.ok) {
      return { success: false, reason: `Vercel API error: ${deploymentsRes.status}` }
    }

    const deploymentsData = await deploymentsRes.json()
    const deployments = deploymentsData.deployments || []

    if (deployments.length < 2) {
      return { success: false, reason: 'Not enough deployments to rollback' }
    }

    // Skip the current (broken) deployment, promote the next one
    const targetDeployment = deployments[1]
    const targetId = targetDeployment.uid

    // Promote the previous deployment to production
    const promoteRes = await fetch(
      `https://api.vercel.com/v13/deployments/${targetId}/promote`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!promoteRes.ok) {
      const errText = await promoteRes.text().catch(() => 'unknown')
      return { success: false, reason: `Promote failed: ${promoteRes.status} — ${errText}` }
    }

    return {
      success: true,
      deploymentId: targetId,
      deploymentUrl: targetDeployment.url,
      createdAt: targetDeployment.created,
    }
  } catch (err) {
    return { success: false, reason: `Rollback error: ${err.message}` }
  }
}

// ── Log to system_health_log ──
async function logHealthDecision(data) {
  const { url, key } = getSupabaseConfig()
  if (!url || !key) return

  try {
    await supabaseInsert('system_health_log', {
      overall_status: data.overallStatus,
      checks_snapshot: data.checksSnapshot || null,
      action: data.action, // 'none', 'rollback', 'alert', 'cooldown_skip'
      action_detail: data.actionDetail || null,
      consecutive_red_count: data.consecutiveRedCount || 0,
      created_at: new Date().toISOString(),
    })
  } catch {
    // Don't crash if logging fails
  }
}

// ── Main handler ──
export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const headers = corsHeaders(req)

  if (!isAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers })
  }

  const { url, key } = getSupabaseConfig()
  if (!url || !key) {
    return Response.json(
      { error: 'Supabase not configured — auto-rollback disabled' },
      { status: 500, headers }
    )
  }

  try {
    // 1. Fetch current health status
    const health = await fetchHealthStatus(req)
    const overallStatus = health.status || 'unknown'

    // 2. Log this check regardless
    const consecutiveRedBefore = await getConsecutiveRedCount()
    const consecutiveRedNow = overallStatus === 'red' ? consecutiveRedBefore + 1 : 0

    // 3. If not red, log and return
    if (overallStatus !== 'red') {
      await logHealthDecision({
        overallStatus,
        checksSnapshot: health.checks || null,
        action: 'none',
        actionDetail: `System healthy (${overallStatus}). Consecutive red reset to 0.`,
        consecutiveRedCount: 0,
      })

      return Response.json({
        status: 'healthy',
        overallStatus,
        consecutiveRedCount: 0,
        action: 'none',
      }, { headers })
    }

    // 4. System is red — log the red check
    await logHealthDecision({
      overallStatus: 'red',
      checksSnapshot: health.checks || null,
      action: consecutiveRedNow >= CONSECUTIVE_RED_THRESHOLD ? 'pending_rollback' : 'none',
      actionDetail: `Red check #${consecutiveRedNow}. Threshold: ${CONSECUTIVE_RED_THRESHOLD}.`,
      consecutiveRedCount: consecutiveRedNow,
    })

    // 5. Not enough consecutive reds yet
    if (consecutiveRedNow < CONSECUTIVE_RED_THRESHOLD) {
      return Response.json({
        status: 'degraded',
        overallStatus: 'red',
        consecutiveRedCount: consecutiveRedNow,
        action: 'monitoring',
        message: `Red check ${consecutiveRedNow}/${CONSECUTIVE_RED_THRESHOLD} — waiting for confirmation before rollback.`,
      }, { headers })
    }

    // 6. Check cooldown — no more than 1 rollback per hour
    const recentRollback = await wasRollbackRecent()
    if (recentRollback) {
      const msg = `System is red (${consecutiveRedNow} consecutive) but rollback was already performed within the last hour. Skipping.`

      await logHealthDecision({
        overallStatus: 'red',
        checksSnapshot: health.checks || null,
        action: 'cooldown_skip',
        actionDetail: msg,
        consecutiveRedCount: consecutiveRedNow,
      })

      await sendAdminSMS(`[Qivori Auto-Rollback] ${msg}`).catch(() => {})

      return Response.json({
        status: 'cooldown',
        overallStatus: 'red',
        consecutiveRedCount: consecutiveRedNow,
        action: 'cooldown_skip',
        message: msg,
      }, { headers })
    }

    // 7. Trigger rollback
    const vercelToken = process.env.VERCEL_TOKEN
    if (!vercelToken) {
      // No Vercel token — alert only, don't crash
      const msg = `System RED for ${consecutiveRedNow} consecutive checks. VERCEL_TOKEN missing — cannot auto-rollback. Manual intervention required.`

      await logHealthDecision({
        overallStatus: 'red',
        checksSnapshot: health.checks || null,
        action: 'alert',
        actionDetail: msg,
        consecutiveRedCount: consecutiveRedNow,
      })

      await sendAdminSMS(`[Qivori CRITICAL] ${msg}`).catch(() => {})
      await sendAdminEmail(
        'CRITICAL: Auto-Rollback Failed — VERCEL_TOKEN Missing',
        `<p style="color:#ef4444;font-weight:700;">System is RED for ${consecutiveRedNow} consecutive health checks.</p>
        <p style="color:#8a8a9a;">Auto-rollback could not proceed because VERCEL_TOKEN is not configured.</p>
        <p style="color:#fff;">Health checks snapshot:</p>
        <pre style="color:#8a8a9a;font-size:12px;background:#1e1e2a;padding:16px;border-radius:8px;overflow:auto;">${JSON.stringify(health.checks, null, 2)}</pre>
        <p style="color:#ef4444;">Please investigate and rollback manually if needed.</p>`
      ).catch(() => {})

      return Response.json({
        status: 'alert_only',
        overallStatus: 'red',
        consecutiveRedCount: consecutiveRedNow,
        action: 'alert',
        message: msg,
      }, { headers })
    }

    // Execute rollback
    const rollbackResult = await rollbackToLastGoodDeployment()

    if (rollbackResult.success) {
      const msg = `Auto-rollback triggered after ${consecutiveRedNow} consecutive red checks. Promoted deployment ${rollbackResult.deploymentId} (${rollbackResult.deploymentUrl}).`

      await logHealthDecision({
        overallStatus: 'red',
        checksSnapshot: health.checks || null,
        action: 'rollback',
        actionDetail: msg,
        consecutiveRedCount: consecutiveRedNow,
      })

      await sendAdminSMS(`[Qivori Auto-Rollback] ${msg}`).catch(() => {})
      await sendAdminEmail(
        'Auto-Rollback Triggered — Previous Deployment Promoted',
        `<p style="color:#f0a500;font-weight:700;">Auto-rollback was triggered.</p>
        <p style="color:#8a8a9a;">System was RED for ${consecutiveRedNow} consecutive health checks.</p>
        <div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;padding:16px;margin:16px 0;">
          <p style="color:#fff;margin:0 0 8px;"><strong>Rolled back to:</strong></p>
          <p style="color:#22c55e;margin:0;">Deployment: ${rollbackResult.deploymentId}</p>
          <p style="color:#8a8a9a;margin:4px 0 0;">URL: ${rollbackResult.deploymentUrl}</p>
          <p style="color:#8a8a9a;margin:4px 0 0;">Originally deployed: ${rollbackResult.createdAt}</p>
        </div>
        <p style="color:#fff;">Failed health checks:</p>
        <pre style="color:#8a8a9a;font-size:12px;background:#1e1e2a;padding:16px;border-radius:8px;overflow:auto;">${JSON.stringify(health.checks, null, 2)}</pre>
        <p style="color:#8a8a9a;">Please investigate the root cause before deploying again.</p>`
      ).catch(() => {})

      return Response.json({
        status: 'rolled_back',
        overallStatus: 'red',
        consecutiveRedCount: consecutiveRedNow,
        action: 'rollback',
        rollback: rollbackResult,
        message: msg,
      }, { headers })
    } else {
      // Rollback failed
      const msg = `Auto-rollback FAILED after ${consecutiveRedNow} red checks: ${rollbackResult.reason}`

      await logHealthDecision({
        overallStatus: 'red',
        checksSnapshot: health.checks || null,
        action: 'rollback_failed',
        actionDetail: msg,
        consecutiveRedCount: consecutiveRedNow,
      })

      await sendAdminSMS(`[Qivori CRITICAL] ${msg}`).catch(() => {})
      await sendAdminEmail(
        'CRITICAL: Auto-Rollback FAILED',
        `<p style="color:#ef4444;font-weight:700;">Auto-rollback failed!</p>
        <p style="color:#8a8a9a;">Reason: ${rollbackResult.reason}</p>
        <p style="color:#8a8a9a;">System has been RED for ${consecutiveRedNow} consecutive checks.</p>
        <pre style="color:#8a8a9a;font-size:12px;background:#1e1e2a;padding:16px;border-radius:8px;overflow:auto;">${JSON.stringify(health.checks, null, 2)}</pre>
        <p style="color:#ef4444;font-weight:700;">Manual intervention required immediately.</p>`
      ).catch(() => {})

      return Response.json({
        status: 'rollback_failed',
        overallStatus: 'red',
        consecutiveRedCount: consecutiveRedNow,
        action: 'rollback_failed',
        reason: rollbackResult.reason,
        message: msg,
      }, { headers })
    }

  } catch (err) {
    // Top-level error — alert and return gracefully
    await sendAdminSMS(`[Qivori Auto-Rollback] Agent crashed: ${err.message?.slice(0, 80)}`).catch(() => {})

    return Response.json({
      status: 'error',
      error: err.message,
    }, { status: 500, headers })
  }
}
