/**
 * Qivori AI — Deep Health Monitor (Cron: every 5 minutes)
 *
 * Performs data integrity, stale data, financial anomaly, security,
 * API endpoint, and error-rate checks.  Logs results to system_health_log
 * and alerts admin on RED status via email + SMS.
 */

import { handleCors, corsHeaders } from './_lib/auth.js'
import { sendAdminEmail, sendAdminSMS } from './_lib/emails.js'

export const config = { runtime: 'edge' }

// ── Auth ──

function isAuthorized(req) {
  const auth = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!auth) return false
  const SECRET = process.env.CRON_SECRET
  return SECRET && auth === SECRET
}

// ── Supabase helpers ──

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  }
}

async function supabaseQuery(path) {
  const url = process.env.SUPABASE_URL
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: supabaseHeaders(),
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${path}`)
  return res.json()
}

async function supabaseInsert(table, row) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return
  await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(row),
  }).catch(() => {})
}

// ── Individual checks ──

async function checkDataIntegrity() {
  const issues = []

  try {
    // Loads with invalid statuses
    const validStatuses = ['available', 'booked', 'dispatched', 'in_transit', 'delivered', 'invoiced', 'paid', 'cancelled']
    const loads = await supabaseQuery(`loads?select=id,status`)
    const invalidLoads = loads.filter(l => l.status && !validStatuses.includes(l.status))
    if (invalidLoads.length > 0) {
      issues.push(`${invalidLoads.length} loads with invalid status`)
    }

    // Invoices with null amounts
    const nullInvoices = await supabaseQuery(`invoices?amount=is.null&select=id`)
    if (nullInvoices.length > 0) {
      issues.push(`${nullInvoices.length} invoices with null amount`)
    }

    // Drivers with missing pay_model
    const missingPay = await supabaseQuery(`drivers?pay_model=is.null&select=id`)
    if (missingPay.length > 0) {
      issues.push(`${missingPay.length} drivers with missing pay_model`)
    }
  } catch (err) {
    return { status: 'red', details: `Query failed: ${err.message}`, counts: {} }
  }

  if (issues.length === 0) {
    return { status: 'green', details: 'All data valid', counts: {} }
  }
  // Any invalid data is yellow; more than 10 issues is red
  const total = issues.length
  return {
    status: total > 2 ? 'red' : 'yellow',
    details: issues.join('; '),
    counts: { issues: total },
  }
}

async function checkStaleData() {
  const issues = []

  try {
    // Check for no new loads in 7+ days across active accounts
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const recentLoads = await supabaseQuery(`loads?created_at=gte.${sevenDaysAgo}&select=id&limit=1`)
    if (recentLoads.length === 0) {
      // Verify there are active accounts first
      const activeProfiles = await supabaseQuery(`profiles?status=in.(active,trial,trialing)&select=id&limit=1`)
      if (activeProfiles.length > 0) {
        issues.push('No new loads in 7+ days (active accounts exist)')
      }
    }

    // Diesel prices older than 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const freshDiesel = await supabaseQuery(`diesel_prices?fetched_at=gte.${oneDayAgo}&select=id&limit=1`)
    if (freshDiesel.length === 0) {
      issues.push('Diesel prices older than 24h')
    }
  } catch (err) {
    return { status: 'yellow', details: `Query failed: ${err.message}`, counts: {} }
  }

  if (issues.length === 0) {
    return { status: 'green', details: 'Data is fresh', counts: {} }
  }
  return {
    status: issues.some(i => i.includes('Diesel')) ? 'red' : 'yellow',
    details: issues.join('; '),
    counts: { issues: issues.length },
  }
}

async function checkFinancialAnomalies() {
  const issues = []

  try {
    // Loads with $0 rate
    const zeroRate = await supabaseQuery(`loads?rate=eq.0&select=id`)
    if (zeroRate.length > 0) {
      issues.push(`${zeroRate.length} loads with $0 rate`)
    }

    // Invoices with amount > $50,000
    const highInvoices = await supabaseQuery(`invoices?amount=gt.50000&select=id,amount`)
    if (highInvoices.length > 0) {
      issues.push(`${highInvoices.length} invoices over $50,000`)
    }

    // Negative expenses
    const negExpenses = await supabaseQuery(`expenses?amount=lt.0&select=id`)
    if (negExpenses.length > 0) {
      issues.push(`${negExpenses.length} negative expenses`)
    }
  } catch (err) {
    return { status: 'yellow', details: `Query failed: ${err.message}`, counts: {} }
  }

  if (issues.length === 0) {
    return { status: 'green', details: 'No anomalies', counts: {} }
  }
  return {
    status: issues.some(i => i.includes('$50,000')) ? 'red' : 'yellow',
    details: issues.join('; '),
    counts: { issues: issues.length },
  }
}

async function checkSecurityRLS() {
  // Attempt an unauthenticated query using the anon key — RLS should block it
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return { status: 'yellow', details: 'Cannot verify RLS — anon key not set', counts: {} }
  }

  try {
    const res = await fetch(`${url}/rest/v1/loads?select=id&limit=1`, {
      headers: {
        'apikey': anonKey,
        // No Authorization bearer — simulating unauthenticated request
      },
    })

    if (!res.ok) {
      // Good — request was blocked
      return { status: 'green', details: 'RLS blocking unauthenticated queries', counts: {} }
    }

    const data = await res.json()
    if (data.length === 0) {
      // Empty result is acceptable — RLS filtered everything
      return { status: 'green', details: 'RLS active (empty result)', counts: {} }
    }

    // Data was returned without auth — RLS may be disabled
    return {
      status: 'red',
      details: `RLS FAILURE: ${data.length} rows returned without auth`,
      counts: { exposed_rows: data.length },
    }
  } catch (err) {
    return { status: 'yellow', details: `RLS check error: ${err.message}`, counts: {} }
  }
}

async function checkAPIEndpoints(req) {
  const results = []
  const baseUrl = req.headers.get('host')
    ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('host')}`
    : null

  if (!baseUrl) {
    return { status: 'yellow', details: 'Cannot determine base URL', counts: {} }
  }

  const endpoints = [
    { name: 'health-check', path: '/api/health-check' },
    { name: 'q-orchestrator', path: '/api/q-orchestrator' },
  ]

  for (const ep of endpoints) {
    try {
      const start = Date.now()
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })
      const latency = Date.now() - start
      if (!res.ok && res.status !== 405) {
        results.push({ name: ep.name, status: 'red', latency })
      } else if (latency > 5000) {
        results.push({ name: ep.name, status: 'yellow', latency })
      } else {
        results.push({ name: ep.name, status: 'green', latency })
      }
    } catch (err) {
      results.push({ name: ep.name, status: 'red', latency: 0, error: err.message })
    }
  }

  const hasRed = results.some(r => r.status === 'red')
  const hasYellow = results.some(r => r.status === 'yellow')
  const overall = hasRed ? 'red' : hasYellow ? 'yellow' : 'green'

  return {
    status: overall,
    details: results.map(r => `${r.name}: ${r.status} (${r.latency}ms)`).join('; '),
    counts: { endpoints_checked: results.length, failing: results.filter(r => r.status === 'red').length },
  }
}

async function checkErrorRate() {
  const sentryToken = process.env.SENTRY_AUTH_TOKEN
  const sentryOrg = process.env.SENTRY_ORG
  const sentryProject = process.env.SENTRY_PROJECT

  if (!sentryToken || !sentryOrg || !sentryProject) {
    return { status: 'green', details: 'Sentry not configured (skipped)', counts: {} }
  }

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const res = await fetch(
      `https://sentry.io/api/0/projects/${sentryOrg}/${sentryProject}/issues/?query=is:unresolved+firstSeen:>${oneHourAgo}&statsPeriod=1h`,
      {
        headers: { 'Authorization': `Bearer ${sentryToken}` },
      }
    )

    if (!res.ok) {
      return { status: 'yellow', details: `Sentry API ${res.status}`, counts: {} }
    }

    const issues = await res.json()
    const errorCount = Array.isArray(issues) ? issues.length : 0

    if (errorCount > 10) {
      return { status: 'red', details: `${errorCount} errors in last hour (spike)`, counts: { errors: errorCount } }
    }
    if (errorCount > 5) {
      return { status: 'yellow', details: `${errorCount} errors in last hour`, counts: { errors: errorCount } }
    }
    return { status: 'green', details: `${errorCount} errors in last hour`, counts: { errors: errorCount } }
  } catch (err) {
    return { status: 'yellow', details: `Sentry check failed: ${err.message}`, counts: {} }
  }
}

// ── Main handler ──

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'GET' && req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(req) })
  }

  // Auth: require CRON_SECRET
  if (!isAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return Response.json(
      { error: 'SUPABASE_URL or SUPABASE_SERVICE_KEY not configured' },
      { status: 500, headers: corsHeaders(req) }
    )
  }

  const startTime = Date.now()
  const results = {}

  // Run all checks in parallel
  const [dataIntegrity, staleData, financial, security, apiHealth, errorRate] = await Promise.allSettled([
    checkDataIntegrity(),
    checkStaleData(),
    checkFinancialAnomalies(),
    checkSecurityRLS(),
    checkAPIEndpoints(req),
    checkErrorRate(),
  ])

  results.data_integrity = dataIntegrity.status === 'fulfilled'
    ? dataIntegrity.value
    : { status: 'red', details: dataIntegrity.reason?.message || 'Check failed', counts: {} }

  results.stale_data = staleData.status === 'fulfilled'
    ? staleData.value
    : { status: 'red', details: staleData.reason?.message || 'Check failed', counts: {} }

  results.financial_anomalies = financial.status === 'fulfilled'
    ? financial.value
    : { status: 'red', details: financial.reason?.message || 'Check failed', counts: {} }

  results.security_rls = security.status === 'fulfilled'
    ? security.value
    : { status: 'red', details: security.reason?.message || 'Check failed', counts: {} }

  results.api_endpoints = apiHealth.status === 'fulfilled'
    ? apiHealth.value
    : { status: 'red', details: apiHealth.reason?.message || 'Check failed', counts: {} }

  results.error_rate = errorRate.status === 'fulfilled'
    ? errorRate.value
    : { status: 'red', details: errorRate.reason?.message || 'Check failed', counts: {} }

  // Determine overall status
  const statuses = Object.values(results).map(r => r.status)
  const overall = statuses.includes('red') ? 'red' : statuses.includes('yellow') ? 'yellow' : 'green'
  const totalLatency = Date.now() - startTime

  // Log to system_health_log
  await supabaseInsert('system_health_log', {
    status: overall,
    checks: results,
    latency_ms: totalLatency,
    created_at: new Date().toISOString(),
  })

  // Alert admin on RED status
  if (overall === 'red') {
    const redChecks = Object.entries(results)
      .filter(([, v]) => v.status === 'red')
      .map(([k, v]) => `${k}: ${v.details}`)

    const alertBody = `<h2 style="color:#ef4444;margin:0 0 12px;">Health Monitor Alert</h2>
      <p style="color:#8a8a9a;font-size:14px;">One or more checks returned RED status:</p>
      <ul style="color:#c8c8d0;font-size:13px;line-height:1.8;">
        ${redChecks.map(c => `<li>${c}</li>`).join('')}
      </ul>
      <p style="color:#8a8a9a;font-size:12px;margin-top:16px;">Timestamp: ${new Date().toISOString()}</p>`

    const smsMessage = `[Qivori ALERT] RED status: ${redChecks.join(' | ').slice(0, 300)}`

    await Promise.allSettled([
      sendAdminEmail('Health Monitor: RED Alert', alertBody),
      sendAdminSMS(smsMessage),
    ])
  }

  return Response.json({
    status: overall,
    checks: results,
    timestamp: new Date().toISOString(),
    latency_ms: totalLatency,
  }, {
    headers: { ...corsHeaders(req), 'Cache-Control': 'no-cache' },
  })
}
