import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

// Track error history in memory (resets on cold start)
const errorLog = []
const MAX_ERRORS = 100

export function logError(source, message) {
  errorLog.unshift({ source, message, ts: new Date().toISOString() })
  if (errorLog.length > MAX_ERRORS) errorLog.length = MAX_ERRORS
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'GET') {
    return Response.json({ error: 'GET only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Verify admin (optional — allow unauthenticated for uptime monitors)
  const { user } = await verifyAuth(req)

  const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const supabaseUrl = rawUrl.startsWith('http') ? rawUrl : null
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  const checks = {}
  const startAll = Date.now()

  // 1. Supabase Database
  checks.database = await checkWithTimeout('database', async () => {
    if (!supabaseUrl || !supabaseKey) return { status: 'red', message: 'Not configured', latency: 0 }
    const start = Date.now()
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id&limit=1`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
    })
    const latency = Date.now() - start
    if (!res.ok) return { status: 'red', message: `HTTP ${res.status}`, latency }
    return { status: latency > 2000 ? 'yellow' : 'green', message: 'Connected', latency }
  })

  // 2. Supabase Auth
  checks.auth = await checkWithTimeout('auth', async () => {
    if (!supabaseUrl) return { status: 'red', message: 'Not configured', latency: 0 }
    const start = Date.now()
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { 'apikey': process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || supabaseKey },
    })
    const latency = Date.now() - start
    if (!res.ok) return { status: 'red', message: `HTTP ${res.status}`, latency }
    return { status: latency > 2000 ? 'yellow' : 'green', message: 'Active', latency }
  })

  // 3. AI Chat (Anthropic)
  checks.aiChat = await checkWithTimeout('ai_chat', async () => {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return { status: 'red', message: 'ANTHROPIC_API_KEY missing', latency: 0 }
    // Just verify key format — don't make an actual API call
    return { status: key.startsWith('sk-') ? 'green' : 'yellow', message: key.startsWith('sk-') ? 'Key configured' : 'Key format unusual', latency: 0 }
  })

  // 4. Email (Resend)
  checks.email = await checkWithTimeout('email', async () => {
    const key = process.env.RESEND_API_KEY
    if (!key) return { status: 'red', message: 'RESEND_API_KEY missing', latency: 0 }
    return { status: 'green', message: 'Configured', latency: 0 }
  })

  // 5. SMS (Twilio)
  checks.sms = await checkWithTimeout('sms', async () => {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const phone = process.env.TWILIO_PHONE_NUMBER
    if (!sid || !token || !phone) return { status: 'yellow', message: 'Not configured', latency: 0 }
    return { status: 'green', message: 'Configured', latency: 0 }
  })

  // 6. Stripe
  checks.stripe = await checkWithTimeout('stripe', async () => {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) return { status: 'yellow', message: 'Not configured', latency: 0 }
    return { status: 'green', message: 'Configured', latency: 0 }
  })

  // 7. EIA (Diesel Prices)
  checks.dieselPrices = await checkWithTimeout('diesel_prices', async () => {
    const key = process.env.EIA_API_KEY
    if (!key) return { status: 'yellow', message: 'EIA_API_KEY missing', latency: 0 }
    return { status: 'green', message: 'Configured', latency: 0 }
  })

  // 8. FMCSA SAFER API
  checks.fmcsa = await checkWithTimeout('fmcsa', async () => {
    const key = process.env.FMCSA_WEBKEY
    if (!key) return { status: 'yellow', message: 'FMCSA_WEBKEY missing', latency: 0 }
    return { status: 'green', message: 'Configured', latency: 0 }
  })

  // 9. Load Board APIs
  checks.loadBoard = await checkWithTimeout('load_board', async () => {
    const dat = process.env.DAT_CLIENT_ID
    const lb123 = process.env.LB123_API_KEY
    const ts = process.env.TRUCKSTOP_CLIENT_ID
    const providers = []
    if (dat) providers.push('DAT')
    if (lb123) providers.push('123LB')
    if (ts) providers.push('Truckstop')
    if (providers.length === 0) return { status: 'yellow', message: 'No API keys', latency: 0 }
    return { status: 'green', message: providers.join(', '), latency: 0 }
  })

  // 9. Diesel cache freshness
  checks.dieselCache = await checkWithTimeout('diesel_cache', async () => {
    if (!supabaseUrl || !supabaseKey) return { status: 'yellow', message: 'No DB', latency: 0 }
    const start = Date.now()
    const res = await fetch(`${supabaseUrl}/rest/v1/diesel_prices?order=fetched_at.desc&limit=1`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
    })
    const latency = Date.now() - start
    if (!res.ok) return { status: 'yellow', message: 'Table missing?', latency }
    const rows = await res.json()
    if (!rows || rows.length === 0) return { status: 'yellow', message: 'Empty', latency }
    const age = (Date.now() - new Date(rows[0].fetched_at).getTime()) / 3600000
    return { status: age > 24 ? 'red' : age > 12 ? 'yellow' : 'green', message: `${age.toFixed(1)}h old`, latency }
  })

  // 10. Edge function runtime
  checks.runtime = {
    status: 'green',
    message: `Edge OK`,
    latency: Date.now() - startAll,
  }

  // Overall status
  const statuses = Object.values(checks).map(c => c.status)
  const overall = statuses.includes('red') ? 'red' : statuses.includes('yellow') ? 'yellow' : 'green'

  return Response.json({
    status: overall,
    checks,
    errors: user ? errorLog.slice(0, 20) : [], // only show errors to authed users
    timestamp: new Date().toISOString(),
    totalLatency: Date.now() - startAll,
  }, {
    headers: { ...corsHeaders(req), 'Cache-Control': 'no-cache' }
  })
}

async function checkWithTimeout(name, fn, timeoutMs = 5000) {
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs)),
    ])
    return result
  } catch (err) {
    logError(name, err.message)
    return { status: 'red', message: err.message || 'Error', latency: timeoutMs }
  }
}
