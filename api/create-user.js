export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } })
  }
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 })
  }

  try {
    const { email, password, full_name, company_name, role } = await req.json()

    if (!email || !password || !full_name) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY

    if (!serviceKey) {
      return Response.json({ error: 'Server not configured' }, { status: 500 })
    }

    // Create auth user via Supabase Admin API
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
      return Response.json({ error: authData.msg || 'Failed to create auth user' }, { status: 400 })
    }

    // Create profile row
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
      const err = await profileRes.text()
      return Response.json({ error: 'Profile creation failed: ' + err }, { status: 500 })
    }

    return Response.json({ id: authData.id, email, role, full_name })
  } catch (e) {
    return Response.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
