/**
 * GET /api/edi/exceptions — List EDI exceptions
 * PATCH /api/edi/exceptions — Resolve/update an exception
 */
import { handleCors, corsHeaders, verifyAuth } from '../_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })

  if (req.method === 'GET') {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/edi_exceptions?owner_id=eq.${user.id}&order=created_at.desc&limit=100&select=*`,
        { headers: sbHeaders() }
      )
      const data = res.ok ? await res.json() : []
      return Response.json({ exceptions: data }, { headers: corsHeaders(req) })
    } catch (err) {
      return Response.json({ exceptions: [], error: err.message }, { status: 500, headers: corsHeaders(req) })
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { id, status, resolution_notes } = await req.json()
      if (!id) return Response.json({ error: 'Missing exception id' }, { status: 400, headers: corsHeaders(req) })

      const updates = {}
      if (status) updates.status = status
      if (resolution_notes) updates.resolution_notes = resolution_notes
      if (status === 'resolved') {
        updates.resolved_by = user.id
        updates.resolved_at = new Date().toISOString()
      }

      const res = await fetch(`${SUPABASE_URL}/rest/v1/edi_exceptions?id=eq.${id}&owner_id=eq.${user.id}`, {
        method: 'PATCH',
        headers: sbHeaders(),
        body: JSON.stringify(updates),
      })

      if (res.ok) {
        return Response.json({ success: true }, { headers: corsHeaders(req) })
      }
      return Response.json({ error: 'Update failed' }, { status: 500, headers: corsHeaders(req) })
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
    }
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(req) })
}
