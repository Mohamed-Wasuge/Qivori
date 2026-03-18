/**
 * Qivori Error Report API
 * Receives frontend crash reports and stores them in Supabase for the self-repair agent.
 * Called automatically by the AppErrorBoundary when any component crashes.
 */
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
  const res = await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: supabaseHeaders('POST'),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Supabase INSERT ${table} failed: ${res.status}`)
}

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const {
      error_message,
      error_stack,
      component_stack,
      page,
      user_agent,
      url,
      timestamp,
    } = body

    if (!error_message) {
      return new Response(JSON.stringify({ error: 'error_message required' }), { status: 400, headers: corsHeaders })
    }

    const dedupeKey = `${error_message}:${page || 'unknown'}`

    await supabaseInsert('error_reports', {
      error_message: String(error_message).slice(0, 2000),
      error_stack: String(error_stack || '').slice(0, 5000),
      component_stack: String(component_stack || '').slice(0, 5000),
      page: String(page || 'unknown').slice(0, 200),
      user_agent: String(user_agent || '').slice(0, 500),
      url: String(url || '').slice(0, 500),
      dedupe_key: dedupeKey.slice(0, 500),
      status: 'new',
      reported_at: timestamp || new Date().toISOString(),
    })

    return new Response(JSON.stringify({ ok: true, message: 'Error logged for self-repair' }), {
      status: 200, headers: corsHeaders,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
}
