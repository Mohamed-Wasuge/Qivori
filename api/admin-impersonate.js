import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL     = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders() {
  return { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  // Verify caller is admin
  const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${req._user.id}&select=role`, { headers: sbHeaders() })
  const profiles   = await profileRes.json()
  if (profiles?.[0]?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403, headers: corsHeaders(req) })

  const { email } = await req.json()
  if (!email) return Response.json({ error: 'email required' }, { status: 400, headers: corsHeaders(req) })

  // Generate a magic link for the target user via Supabase Admin API
  const res  = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({ type: 'magiclink', email }),
  })
  const data = await res.json()

  if (!res.ok) return Response.json({ error: data.message || 'Failed to generate link' }, { status: 500, headers: corsHeaders(req) })

  return Response.json({ url: data.action_link }, { headers: corsHeaders(req) })
}
