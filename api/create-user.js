import { corsHeaders, handleCors } from './_lib/auth.js'

export const config = { runtime: 'edge' }

// Rate limiting: track IPs in memory (resets on cold start, but good enough for Edge)
const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX = 5 // max 5 signups per minute per IP

function isRateLimited(ip) {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 })
    return false
  }
  entry.count++
  if (entry.count > RATE_LIMIT_MAX) return true
  return false
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json()
    const {
      email, password, full_name, company_name, role,
      // Extended carrier fields (set by admin onboarding wizard)
      mc_number, dot_number, phone, address, city, state, zip,
      equipment, home_base_city, home_base_state,
      subscription_plan,
    } = body

    if (!email || !password || !full_name) {
      return Response.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders(req) })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return Response.json({ error: 'Invalid email format' }, { status: 400, headers: corsHeaders(req) })
    }

    // Validate password strength
    if (password.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400, headers: corsHeaders(req) })
    }

    // Validate role
    const allowedRoles = ['carrier', 'broker']
    const sanitizedRole = allowedRoles.includes(role) ? role : 'carrier'

    // Sanitize text inputs
    const safeName = String(full_name).replace(/[<>"']/g, '').substring(0, 100)
    const safeCompany = company_name ? String(company_name).replace(/[<>"']/g, '').substring(0, 100) : null

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY

    if (!serviceKey || !supabaseUrl) {
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
      return Response.json({ error: authData.msg || 'Failed to create account' }, { status: 400, headers: corsHeaders(req) })
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
        role: sanitizedRole,
        full_name: safeName,
        company_name: safeCompany,
        status: 'active',
        // Extended carrier fields from the admin onboarding wizard
        mc_number: mc_number || null,
        dot_number: dot_number || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        equipment: equipment || null,
        home_base_city: home_base_city || null,
        home_base_state: home_base_state || null,
        subscription_plan: subscription_plan || 'autonomous_fleet',
        subscription_status: 'trialing',
      }),
    })

    if (!profileRes.ok) {
      const errText = await profileRes.text()
      return Response.json({ error: 'Profile creation failed: ' + errText }, { status: 500, headers: corsHeaders(req) })
    }

    // ── Also insert a drivers row so the carrier shows up in HR ──
    // For owner-operators, the carrier IS the driver. The drivers table
    // owner_id points back to the carrier's auth user, so when they log
    // in their HR / Drivers page sees themselves as their first driver.
    if (sanitizedRole === 'carrier') {
      await fetch(`${supabaseUrl}/rest/v1/drivers`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          owner_id: authData.id,
          full_name: safeName,
          email,
          phone: phone || null,
          status: 'Active',
          hire_date: new Date().toISOString().split('T')[0],
          notes: 'Auto-created from admin onboarding wizard',
        }),
      }).catch(() => {})
    }

    return Response.json({ id: authData.id, email, role: sanitizedRole, full_name: safeName }, { headers: corsHeaders(req) })
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
