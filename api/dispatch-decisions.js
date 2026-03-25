// api/dispatch-decisions.js — Fetch + override dispatch decisions
import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  // GET — list dispatch decisions with optional filters
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url)
      const decision = url.searchParams.get('decision')
      const broker = url.searchParams.get('broker')
      const from = url.searchParams.get('from')
      const to = url.searchParams.get('to')
      const limit = parseInt(url.searchParams.get('limit') || '100')
      const offset = parseInt(url.searchParams.get('offset') || '0')

      let query = `${SUPABASE_URL}/rest/v1/dispatch_decisions?owner_id=eq.${user.id}&select=*&order=created_at.desc&limit=${limit}&offset=${offset}`
      if (decision) query += `&decision=eq.${decision}`
      if (from) query += `&created_at=gte.${from}`
      if (to) query += `&created_at=lte.${to}`

      const res = await fetch(query, {
        headers: { ...sbHeaders(), 'Prefer': 'count=exact' },
      })

      const total = res.headers.get('content-range')?.split('/')?.[1] || '0'
      const rows = await res.json()

      // Filter by broker name in load_data (PostgREST can't filter nested JSON easily)
      let filtered = rows
      if (broker) {
        const b = broker.toLowerCase()
        filtered = rows.filter(r => (r.load_data?.broker || '').toLowerCase().includes(b))
      }

      return Response.json({ decisions: filtered, total: parseInt(total) }, { headers: corsHeaders(req) })
    } catch (err) {
      return Response.json({ error: err.message || 'Failed to fetch' }, { status: 500, headers: corsHeaders(req) })
    }
  }

  // PATCH — manual override of a decision
  if (req.method === 'PATCH') {
    try {
      const body = await req.json()
      const { id, decision, override_reason } = body

      if (!id) return Response.json({ error: 'Decision ID required' }, { status: 400, headers: corsHeaders(req) })
      if (!decision || !['accept', 'reject', 'negotiate'].includes(decision)) {
        return Response.json({ error: 'Invalid decision (accept/reject/negotiate)' }, { status: 400, headers: corsHeaders(req) })
      }

      // Verify ownership
      const checkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/dispatch_decisions?id=eq.${id}&owner_id=eq.${user.id}&select=id`,
        { headers: sbHeaders() }
      )
      const existing = await checkRes.json()
      if (!existing?.length) {
        return Response.json({ error: 'Decision not found' }, { status: 404, headers: corsHeaders(req) })
      }

      // Build update — store override in reasons array
      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/dispatch_decisions?id=eq.${id}&owner_id=eq.${user.id}`,
        {
          method: 'PATCH',
          headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify({
            decision,
            reasons: [
              `MANUAL OVERRIDE: Changed to ${decision.toUpperCase()}`,
              ...(override_reason ? [`Reason: ${override_reason}`] : []),
            ],
            confidence: 100,
          }),
        }
      )
      const updated = await updateRes.json()
      return Response.json({ ok: true, decision: updated?.[0] }, { headers: corsHeaders(req) })
    } catch (err) {
      return Response.json({ error: err.message || 'Override failed' }, { status: 500, headers: corsHeaders(req) })
    }
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(req) })
}
