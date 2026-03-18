/**
 * Qivori Uptime Monitor
 * Pings critical endpoints every 5 minutes.
 * If any endpoint is down or slow (>5s), sends SMS + email alert.
 * Logs all checks to Supabase for historical uptime tracking.
 */
import { sendAdminEmail, sendAdminSMS } from './_lib/emails.js'

export const config = { runtime: 'edge' }

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

async function supabaseInsert(table, data) {
  await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: supabaseHeaders('POST'),
    body: JSON.stringify(data),
  })
}

async function supabaseGet(path) {
  const res = await fetch(`${supabaseUrl()}/rest/v1/${path}`, { headers: supabaseHeaders() })
  if (!res.ok) return []
  return res.json()
}

function isAuthorized(req) {
  const authHeader = req.headers.get('authorization') || ''
  const serviceKey = req.headers.get('x-service-key') || ''
  const cronSecret = process.env.CRON_SECRET
  const svcKey = process.env.SUPABASE_SERVICE_KEY
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  if (svcKey && serviceKey === svcKey) return true
  return false
}

// Endpoints to monitor
const ENDPOINTS = [
  { name: 'Homepage', url: 'https://www.qivori.com', critical: true },
  { name: 'App (Settings)', url: 'https://www.qivori.com/settings', critical: true },
  { name: 'API Health', url: 'https://www.qivori.com/api/bot-health-monitor', critical: true },
  { name: 'Supabase REST', url: `${process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL}/rest/v1/`, critical: true },
]

const TIMEOUT_MS = 10000 // 10 second timeout
const SLOW_THRESHOLD_MS = 5000 // Alert if response > 5s

async function pingEndpoint(endpoint) {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(endpoint.url, {
      method: 'GET',
      signal: controller.signal,
      headers: endpoint.url.includes('supabase') ? {
        'apikey': supabaseKey(),
      } : {},
    })

    clearTimeout(timeout)
    const responseTime = Date.now() - start
    const status = res.status

    return {
      name: endpoint.name,
      url: endpoint.url,
      status_code: status,
      response_time_ms: responseTime,
      is_up: status >= 200 && status < 400,
      is_slow: responseTime > SLOW_THRESHOLD_MS,
      critical: endpoint.critical,
      error: null,
    }
  } catch (err) {
    return {
      name: endpoint.name,
      url: endpoint.url,
      status_code: 0,
      response_time_ms: Date.now() - start,
      is_up: false,
      is_slow: false,
      critical: endpoint.critical,
      error: err.message || 'Unknown error',
    }
  }
}

export default async function handler(req) {
  const corsHeaders = { 'Content-Type': 'application/json' }

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  try {
    // Ping all endpoints in parallel
    const results = await Promise.all(ENDPOINTS.map(pingEndpoint))

    const downEndpoints = results.filter(r => !r.is_up)
    const slowEndpoints = results.filter(r => r.is_up && r.is_slow)
    const allHealthy = downEndpoints.length === 0 && slowEndpoints.length === 0

    // Log results to Supabase
    for (const result of results) {
      await supabaseInsert('uptime_checks', {
        endpoint_name: result.name,
        endpoint_url: result.url,
        status_code: result.status_code,
        response_time_ms: result.response_time_ms,
        is_up: result.is_up,
        is_slow: result.is_slow,
        error_message: result.error,
        checked_at: new Date().toISOString(),
      }).catch(() => {})
    }

    // Alert if anything is down
    if (downEndpoints.length > 0) {
      const downList = downEndpoints.map(e => `  - ${e.name}: ${e.error || 'HTTP ' + e.status_code}`).join('\n')

      await sendAdminSMS(
        `[QIVORI DOWN] ${downEndpoints.length} endpoint(s) are DOWN:\n${downEndpoints.map(e => e.name).join(', ')}`
      ).catch(() => {})

      await sendAdminEmail(
        `ALERT: Qivori Downtime Detected — ${downEndpoints.length} endpoint(s) down`,
        `The uptime monitor detected the following endpoints are DOWN:\n\n${downList}\n\nFull results:\n${results.map(r => `${r.is_up ? 'UP' : 'DOWN'} | ${r.name} | ${r.response_time_ms}ms | ${r.error || 'OK'}`).join('\n')}\n\nChecked at: ${new Date().toISOString()}`
      ).catch(() => {})
    }

    // Alert if anything is slow
    if (slowEndpoints.length > 0) {
      await sendAdminSMS(
        `[QIVORI SLOW] ${slowEndpoints.length} endpoint(s) responding slowly: ${slowEndpoints.map(e => `${e.name} (${e.response_time_ms}ms)`).join(', ')}`
      ).catch(() => {})
    }

    return new Response(JSON.stringify({
      status: allHealthy ? 'healthy' : 'degraded',
      checked_at: new Date().toISOString(),
      total: results.length,
      up: results.filter(r => r.is_up).length,
      down: downEndpoints.length,
      slow: slowEndpoints.length,
      results,
    }), { status: 200, headers: corsHeaders })

  } catch (err) {
    await sendAdminSMS(`[Qivori Uptime] Monitor error: ${err.message?.slice(0, 80)}`).catch(() => {})
    return new Response(JSON.stringify({ status: 'error', error: err.message }), {
      status: 500, headers: corsHeaders,
    })
  }
}
