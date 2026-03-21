/**
 * Qivori Error Report API
 * Receives frontend crash reports and stores them in Supabase for the self-repair agent.
 * Called automatically by the AppErrorBoundary when any component crashes.
 */
import { sanitizeString } from './_lib/sanitize.js'

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

    const error_message = sanitizeString(body.error_message, 2000)
    const error_stack = sanitizeString(body.error_stack, 5000)
    const component_stack = sanitizeString(body.component_stack, 5000)
    const page = sanitizeString(body.page || 'unknown', 200)
    const user_agent = sanitizeString(body.user_agent, 500)
    const url = sanitizeString(body.url, 500)
    const timestamp = body.timestamp

    if (!error_message) {
      return new Response(JSON.stringify({ error: 'error_message required' }), { status: 400, headers: corsHeaders })
    }

    const dedupeKey = `${error_message}:${page}`.slice(0, 500)

    await supabaseInsert('error_reports', {
      error_message,
      error_stack,
      component_stack,
      page,
      user_agent,
      url,
      dedupe_key: dedupeKey,
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
