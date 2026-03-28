/**
 * GET /api/edi/partners — List trading partners
 * POST /api/edi/partners — Create new trading partner
 * PATCH /api/edi/partners — Update trading partner
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

  // GET — List partners
  if (req.method === 'GET') {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/trading_partners?owner_id=eq.${user.id}&order=name.asc&select=*`,
        { headers: sbHeaders() }
      )
      const data = res.ok ? await res.json() : []
      return Response.json({ partners: data }, { headers: corsHeaders(req) })
    } catch (err) {
      return Response.json({ partners: [], error: err.message }, { status: 500, headers: corsHeaders(req) })
    }
  }

  // POST — Create partner
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      if (!body.name) return Response.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders(req) })

      const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_partners`, {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify({
          owner_id: user.id,
          name: body.name,
          isa_id: body.isa_id || null,
          gs_id: body.gs_id || null,
          partner_type: body.partner_type || 'broker',
          connection_type: body.connection_type || 'api',
          api_endpoint: body.api_endpoint || null,
          api_key: body.api_key || null,
          field_mapping: body.field_mapping || {},
          auto_accept: body.auto_accept || false,
          auto_respond: body.auto_respond !== false,
          send_214: body.send_214 !== false,
          send_210: body.send_210 !== false,
          min_profit: body.min_profit || null,
          min_rpm: body.min_rpm || null,
          contact_name: body.contact_name || null,
          contact_email: body.contact_email || null,
          contact_phone: body.contact_phone || null,
          status: 'active',
        }),
      })

      if (res.ok) {
        const data = await res.json()
        return Response.json({ success: true, partner: Array.isArray(data) ? data[0] : data }, { headers: corsHeaders(req) })
      }
      const err = await res.text()
      return Response.json({ error: err }, { status: 500, headers: corsHeaders(req) })
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
    }
  }

  // PATCH — Update partner
  if (req.method === 'PATCH') {
    try {
      const body = await req.json()
      if (!body.id) return Response.json({ error: 'Missing partner id' }, { status: 400, headers: corsHeaders(req) })

      const { id, ...updates } = body
      const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_partners?id=eq.${id}&owner_id=eq.${user.id}`, {
        method: 'PATCH',
        headers: sbHeaders(),
        body: JSON.stringify(updates),
      })

      if (res.ok) return Response.json({ success: true }, { headers: corsHeaders(req) })
      return Response.json({ error: 'Update failed' }, { status: 500, headers: corsHeaders(req) })
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
    }
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(req) })
}
