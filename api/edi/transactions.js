/**
 * GET /api/edi/transactions
 * List EDI transactions for the authenticated user.
 * Query params: type, direction, limit, status
 */
import { handleCors, corsHeaders, verifyAuth } from '../_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })

  try {
    const url = new URL(req.url)
    const type = url.searchParams.get('type')
    const direction = url.searchParams.get('direction')
    const status = url.searchParams.get('status')
    const limit = parseInt(url.searchParams.get('limit')) || 100

    let query = `${SUPABASE_URL}/rest/v1/edi_transactions?owner_id=eq.${user.id}&order=created_at.desc&limit=${limit}&select=*`
    if (type) query += `&transaction_type=eq.${type}`
    if (direction) query += `&direction=eq.${direction}`
    if (status) query += `&status=eq.${status}`

    const res = await fetch(query, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) return Response.json({ transactions: [] }, { headers: corsHeaders(req) })
    const data = await res.json()

    return Response.json({ transactions: data || [] }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message, transactions: [] }, { status: 500, headers: corsHeaders(req) })
  }
}
