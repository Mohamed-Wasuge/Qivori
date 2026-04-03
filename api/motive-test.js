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

  // Only allow with admin auth
  const auth = req.headers.get('authorization')?.replace('Bearer ', '')
  const CRON_SECRET = process.env.CRON_SECRET
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
  if (!auth || (auth !== CRON_SECRET && auth !== SERVICE_KEY)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
  }

  const ACCESS_TOKEN = process.env.MOTIVE_ACCESS_TOKEN
  if (!ACCESS_TOKEN) {
    return Response.json({ error: 'MOTIVE_ACCESS_TOKEN not set in env vars' }, { status: 500, headers: corsHeaders })
  }

  const results = {}
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

  // Test 4: Get HOS daily logs
  try {
    const res = await fetch('https://api.gomotive.com/v1/hours_of_service/daily_logs?per_page=5', { headers })
    results.hos_logs = { status: res.status, ok: res.ok }
    if (res.ok) {
      const data = await res.json()
      results.hos_logs.count = (data.daily_logs || data.data || []).length
      results.hos_logs.sample = (data.daily_logs || data.data || []).slice(0, 2)
    } else results.hos_logs.error = await res.text()
  } catch (e) { results.hos_logs = { error: e.message } }

  // Test 5: Get vehicle inspections (DVIRs)
  try {
    const res = await fetch('https://api.gomotive.com/v1/vehicle_inspections?per_page=5', { headers })
    results.dvirs = { status: res.status, ok: res.ok }
    if (res.ok) {
      const data = await res.json()
      results.dvirs.count = (data.vehicle_inspections || data.data || []).length
      results.dvirs.sample = (data.vehicle_inspections || data.data || []).slice(0, 2)
    } else results.dvirs.error = await res.text()
  } catch (e) { results.dvirs = { error: e.message } }

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
