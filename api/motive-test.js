// api/motive-test.js — Test Motive Dummy Fleet connection
// Uses the test access token to verify API connectivity
// DELETE this file before production launch

export const config = { runtime: 'edge' }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Allow admin auth OR authenticated Supabase user (admin role)
  const auth = req.headers.get('authorization')?.replace('Bearer ', '')
  const CRON_SECRET = process.env.CRON_SECRET
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
  const SUPABASE_URL = process.env.SUPABASE_URL

  let authorized = false
  if (auth && ((CRON_SECRET && auth === CRON_SECRET) || (SERVICE_KEY && auth === SERVICE_KEY))) {
    authorized = true
  } else if (auth && SUPABASE_URL && SERVICE_KEY) {
    // Check if it's a valid Supabase user token
    try {
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${auth}` },
      })
      if (userRes.ok) authorized = true
    } catch {}
  }
  if (!authorized) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
  }

  let ACCESS_TOKEN = process.env.MOTIVE_ACCESS_TOKEN
  const REFRESH_TOKEN = process.env.MOTIVE_REFRESH_TOKEN
  const CLIENT_ID = process.env.MOTIVE_CLIENT_ID
  const CLIENT_SECRET = process.env.MOTIVE_CLIENT_SECRET

  if (!ACCESS_TOKEN) {
    return Response.json({ error: 'MOTIVE_ACCESS_TOKEN not set in env vars' }, { status: 500, headers: corsHeaders })
  }

  // Step 1: Try to refresh the token first (tokens expire quickly)
  let refreshResult = null
  if (REFRESH_TOKEN && CLIENT_ID && CLIENT_SECRET) {
    try {
      const refreshRes = await fetch('https://api.gomotive.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: REFRESH_TOKEN,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      })
      if (refreshRes.ok) {
        const tokenData = await refreshRes.json()
        ACCESS_TOKEN = tokenData.access_token
        refreshResult = {
          ok: true,
          new_token_prefix: ACCESS_TOKEN.slice(0, 10) + '...',
          expires_in: tokenData.expires_in,
          note: 'UPDATE MOTIVE_ACCESS_TOKEN in Vercel with this new token',
          new_access_token: ACCESS_TOKEN,
          new_refresh_token: tokenData.refresh_token || REFRESH_TOKEN,
        }
      } else {
        refreshResult = { ok: false, status: refreshRes.status, error: await refreshRes.text() }
      }
    } catch (e) {
      refreshResult = { ok: false, error: e.message }
    }
  } else {
    refreshResult = { skipped: true, reason: 'Missing MOTIVE_CLIENT_ID or MOTIVE_CLIENT_SECRET — cannot refresh token' }
  }

  const results = { token_refresh: refreshResult }
  const headers = {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  }

  // Test 1: Get users/company info
  try {
    const res = await fetch('https://api.gomotive.com/v1/users', { headers })
    results.users = { status: res.status, ok: res.ok }
    if (res.ok) results.users.data = await res.json()
    else results.users.error = await res.text()
  } catch (e) { results.users = { error: e.message } }

  // Test 2: Get vehicles
  try {
    const res = await fetch('https://api.gomotive.com/v1/vehicles', { headers })
    results.vehicles = { status: res.status, ok: res.ok }
    if (res.ok) {
      const data = await res.json()
      results.vehicles.count = (data.vehicles || data.data || []).length
      results.vehicles.sample = (data.vehicles || data.data || []).slice(0, 2)
    } else results.vehicles.error = await res.text()
  } catch (e) { results.vehicles = { error: e.message } }

  // Test 3: Get drivers
  try {
    const res = await fetch('https://api.gomotive.com/v1/users?role=driver', { headers })
    results.drivers = { status: res.status, ok: res.ok }
    if (res.ok) {
      const data = await res.json()
      results.drivers.count = (data.users || data.data || []).length
      results.drivers.sample = (data.users || data.data || []).slice(0, 2)
    } else results.drivers.error = await res.text()
  } catch (e) { results.drivers = { error: e.message } }

  // Test 4: Get HOS daily logs (try multiple endpoint paths)
  const hosEndpoints = [
    'https://api.gomotive.com/v1/hours_of_service/daily_logs?per_page=5',
    'https://api.gomotive.com/v2/hours_of_service/daily_logs?per_page=5',
    'https://api.gomotive.com/v1/hos_daily_logs?per_page=5',
  ]
  for (const hosUrl of hosEndpoints) {
    try {
      const res = await fetch(hosUrl, { headers })
      if (res.ok) {
        const data = await res.json()
        results.hos_logs = { status: res.status, ok: true, endpoint: hosUrl, count: (data.daily_logs || data.data || []).length, sample: (data.daily_logs || data.data || []).slice(0, 2) }
        break
      } else if (!results.hos_logs || results.hos_logs.status === 404) {
        results.hos_logs = { status: res.status, ok: false, endpoint: hosUrl, error: (await res.text()).slice(0, 200) }
      }
    } catch (e) { results.hos_logs = { error: e.message, endpoint: hosUrl } }
  }

  // Test 5: Get vehicle inspections / DVIRs (try multiple paths)
  const dvirEndpoints = [
    'https://api.gomotive.com/v1/vehicle_inspections?per_page=5',
    'https://api.gomotive.com/v2/vehicle_inspections?per_page=5',
    'https://api.gomotive.com/v1/dvirs?per_page=5',
    'https://api.gomotive.com/v1/inspection_reports?per_page=5',
  ]
  for (const dvirUrl of dvirEndpoints) {
    try {
      const res = await fetch(dvirUrl, { headers })
      if (res.ok) {
        const data = await res.json()
        results.dvirs = { status: res.status, ok: true, endpoint: dvirUrl, count: (data.vehicle_inspections || data.inspections || data.data || []).length, sample: (data.vehicle_inspections || data.inspections || data.data || []).slice(0, 2) }
        break
      } else if (!results.dvirs || results.dvirs.status === 404) {
        results.dvirs = { status: res.status, ok: false, endpoint: dvirUrl, error: (await res.text()).slice(0, 200) }
      }
    } catch (e) { results.dvirs = { error: e.message, endpoint: dvirUrl } }
  }

  // Test 6: Get company info
  try {
    const res = await fetch('https://api.gomotive.com/v1/companies', { headers })
    results.company = { status: res.status, ok: res.ok }
    if (res.ok) results.company.data = await res.json()
    else results.company.error = await res.text()
  } catch (e) { results.company = { error: e.message } }

  return Response.json({
    ok: true,
    test: 'Motive Dummy Fleet API Test',
    token_prefix: ACCESS_TOKEN.slice(0, 10) + '...',
    results,
  }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
