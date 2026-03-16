import { sendSMS } from './_lib/sms.js'
import { sendEmail } from './_lib/emails.js'

export const config = { runtime: 'edge' }

/**
 * Master Admin AI Agent — Health Monitor Bot
 * Runs via cron or manual trigger. Checks all systems, alerts admin on failures.
 * Auto-logs issues to notifications table for the admin dashboard.
 */
export default async function handler(req) {
  // Auth: cron secret or service key
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const isServiceKey = req.headers.get('x-service-key') === process.env.SUPABASE_SERVICE_KEY
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isServiceKey) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPhone = process.env.ADMIN_PHONE
  const results = { checks: {}, alerts_sent: 0, issues: [] }

  // ── Run all health checks ──
  const checks = await runHealthChecks(supabaseUrl, serviceKey)
  results.checks = checks

  // ── Identify issues ──
  for (const [name, check] of Object.entries(checks)) {
    if (check.status === 'red') {
      results.issues.push({ name, severity: 'critical', message: check.message })
    } else if (check.status === 'yellow') {
      results.issues.push({ name, severity: 'warning', message: check.message })
    }
  }

  // ── Count active users & loads for daily report ──
  let stats = { carriers: 0, brokers: 0, activeLoads: 0, revenue: 0 }
  if (supabaseUrl && serviceKey) {
    try {
      const sbHeaders = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
      const [profilesRes, loadsRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/profiles?select=role,subscription_status`, { headers: sbHeaders }),
        fetch(`${supabaseUrl}/rest/v1/loads?select=id,status,rate&status=not.in.(Delivered,Paid,Invoiced)`, { headers: sbHeaders }),
      ])
      const profiles = await profilesRes.json().catch(() => [])
      const loads = await loadsRes.json().catch(() => [])
      stats.carriers = (profiles || []).filter(p => p.role === 'carrier').length
      stats.brokers = (profiles || []).filter(p => p.role === 'broker').length
      stats.activeLoads = (loads || []).length
      stats.revenue = (loads || []).reduce((s, l) => s + (parseFloat(l.rate) || 0), 0)
    } catch {}
  }

  // ── Alert on critical issues ──
  const criticalIssues = results.issues.filter(i => i.severity === 'critical')
  if (criticalIssues.length > 0) {
    const alertMsg = `QIVORI ALERT: ${criticalIssues.length} system(s) DOWN\n${criticalIssues.map(i => `- ${i.name}: ${i.message}`).join('\n')}`

    // SMS alert
    if (adminPhone) {
      await sendSMS(adminPhone, alertMsg).catch(() => {})
      results.alerts_sent++
    }

    // Email alert
    if (adminEmail) {
      const html = buildAlertEmail(criticalIssues, checks, stats)
      await sendEmail(adminEmail, `QIVORI: ${criticalIssues.length} System(s) Down`, html).catch(() => {})
      results.alerts_sent++
    }
  }

  // ── Daily summary email (always send) ──
  if (adminEmail && req.method === 'GET') {
    const html = buildDailyReport(checks, stats, results.issues)
    await sendEmail(adminEmail, `Qivori Daily Report — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`, html).catch(() => {})
  }

  // ── Log to notifications table ──
  if (supabaseUrl && serviceKey && results.issues.length > 0) {
    for (const issue of results.issues) {
      await fetch(`${supabaseUrl}/rest/v1/notifications`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          title: `[${issue.severity.toUpperCase()}] ${issue.name}`,
          body: issue.message,
          user_id: 'system',
          read: false,
        }),
      }).catch(() => {})
    }
  }

  return Response.json({
    status: criticalIssues.length > 0 ? 'alert' : results.issues.length > 0 ? 'warning' : 'healthy',
    ...results,
    stats,
    timestamp: new Date().toISOString(),
  })
}

async function runHealthChecks(supabaseUrl, serviceKey) {
  const checks = {}

  // Database
  checks.database = await timedCheck(async () => {
    if (!supabaseUrl || !serviceKey) return { status: 'red', message: 'Not configured' }
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id&limit=1`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
    })
    if (!res.ok) return { status: 'red', message: `HTTP ${res.status}` }
    return { status: 'green', message: 'Connected' }
  })

  // Auth
  checks.auth = await timedCheck(async () => {
    if (!supabaseUrl) return { status: 'red', message: 'Not configured' }
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || serviceKey
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { 'apikey': anonKey } })
    if (!res.ok) return { status: 'red', message: `HTTP ${res.status}` }
    return { status: 'green', message: 'Active' }
  })

  // AI
  checks.ai = await timedCheck(async () => {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return { status: 'red', message: 'Missing API key' }
    return { status: 'green', message: 'Configured' }
  })

  // Email
  checks.email = await timedCheck(async () => {
    const key = process.env.RESEND_API_KEY
    if (!key) return { status: 'red', message: 'Missing' }
    return { status: 'green', message: 'Configured' }
  })

  // SMS
  checks.sms = await timedCheck(async () => {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const phone = process.env.TWILIO_PHONE_NUMBER
    if (!sid || !token || !phone) return { status: 'yellow', message: 'Not configured' }
    return { status: 'green', message: 'Configured' }
  })

  // Stripe
  checks.stripe = await timedCheck(async () => {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) return { status: 'yellow', message: 'Not configured' }
    return { status: 'green', message: 'Configured' }
  })

  return checks
}

async function timedCheck(fn) {
  const start = Date.now()
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 5000)),
    ])
    return { ...result, latency: Date.now() - start }
  } catch (err) {
    return { status: 'red', message: err.message, latency: Date.now() - start }
  }
}

function buildAlertEmail(issues, checks, stats) {
  const rows = issues.map(i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a35;color:#ef4444;font-weight:700;font-size:13px;">${i.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a35;color:#ccc;font-size:13px;">${i.message}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:24px;">
<span style="font-size:28px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
<span style="font-size:12px;color:#ef4444;letter-spacing:2px;font-weight:700;margin-left:6px;">ALERT</span>
</div>
<div style="background:#1a1111;border:1px solid #ef4444;border-radius:12px;padding:24px;margin-bottom:16px;">
<h2 style="color:#ef4444;font-size:18px;margin:0 0 16px;">System Alert — ${issues.length} Issue(s)</h2>
<table style="width:100%;border-collapse:collapse;">${rows}</table>
</div>
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:12px;padding:16px;font-size:12px;color:#8a8a9a;">
<div style="margin-bottom:8px;font-weight:700;color:#fff;">Platform Stats</div>
${stats.carriers} carriers · ${stats.brokers} brokers · ${stats.activeLoads} active loads
</div>
</div></body></html>`
}

function buildDailyReport(checks, stats, issues) {
  const statusEmoji = (s) => s === 'green' ? '&#9989;' : s === 'yellow' ? '&#9888;&#65039;' : '&#10060;'
  const checkRows = Object.entries(checks).map(([name, c]) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #2a2a35;font-size:13px;">${statusEmoji(c.status)} ${name}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #2a2a35;color:#8a8a9a;font-size:12px;">${c.message}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #2a2a35;color:#8a8a9a;font-size:12px;">${c.latency || 0}ms</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:24px;">
<span style="font-size:28px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
<span style="font-size:12px;color:#00d4aa;letter-spacing:2px;font-weight:700;margin-left:6px;">DAILY REPORT</span>
</div>
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:12px;padding:24px;margin-bottom:16px;">
<h2 style="color:#f0a500;font-size:18px;margin:0 0 16px;">Platform Status</h2>
<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
<div style="flex:1;min-width:80px;background:#1e1e2a;border-radius:8px;padding:12px;text-align:center;">
<div style="font-size:22px;font-weight:800;color:#f0a500;">${stats.carriers}</div>
<div style="font-size:10px;color:#8a8a9a;">Carriers</div>
</div>
<div style="flex:1;min-width:80px;background:#1e1e2a;border-radius:8px;padding:12px;text-align:center;">
<div style="font-size:22px;font-weight:800;color:#4d8ef0;">${stats.brokers}</div>
<div style="font-size:10px;color:#8a8a9a;">Brokers</div>
</div>
<div style="flex:1;min-width:80px;background:#1e1e2a;border-radius:8px;padding:12px;text-align:center;">
<div style="font-size:22px;font-weight:800;color:#22c55e;">${stats.activeLoads}</div>
<div style="font-size:10px;color:#8a8a9a;">Active Loads</div>
</div>
</div>
<table style="width:100%;border-collapse:collapse;">${checkRows}</table>
</div>
${issues.length > 0 ? `<div style="background:#2d2211;border:1px solid #f0a500;border-radius:12px;padding:16px;font-size:12px;color:#f0a500;margin-bottom:16px;">${issues.length} issue(s) detected — check admin dashboard</div>` : '<div style="background:#112d11;border:1px solid #22c55e;border-radius:12px;padding:16px;font-size:12px;color:#22c55e;">All systems operational</div>'}
</div></body></html>`
}
