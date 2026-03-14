import { corsHeaders, handleCors } from './_lib/auth.js'

export const config = { runtime: 'edge' }

// No user auth required — this is an admin endpoint that uses the service key.
// Protected by requiring the service key to be configured on the server.
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  try {
    const { email, password, full_name, company_name, role } = await req.json()

    if (!email || !password || !full_name) {
      return Response.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders(req) })
    }

    // Validate password strength
    if (password.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400, headers: corsHeaders(req) })
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY

    if (!serviceKey) {
      return Response.json({ error: 'Server not configured' }, { status: 500, headers: corsHeaders(req) })
    }

    const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    })

    const authData = await authRes.json()

    if (!authData.id) {
      return Response.json({ error: authData.msg || 'Failed to create auth user' }, { status: 400, headers: corsHeaders(req) })
    }

    const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        id: authData.id,
        email,
        role: role || 'carrier',
        full_name,
        company_name: company_name || null,
        status: 'active',
      }),
    })

    if (!profileRes.ok) {
      return Response.json({ error: 'Profile creation failed' }, { status: 500, headers: corsHeaders(req) })
    }

    return Response.json({ id: authData.id, email, role, full_name }, { headers: corsHeaders(req) })
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
