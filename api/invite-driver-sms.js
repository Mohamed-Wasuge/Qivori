/**
 * POST /api/invite-driver-sms
 * Called from the Q mobile app Fleet tab by an owner/admin.
 * Creates a driver account + optionally assigns a truck + sends SMS invite.
 *
 * Body: { phone, email, fullName, truckId?, cdl? }
 * Auth: Bearer {owner_access_token}
 *
 * Returns: { success, driver: { id, full_name, email, phone, assigned_truck_id } }
 */
import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
import { sendSMS } from './_lib/sms.js'

export const config = { runtime: 'edge' }

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

function sbHeaders() {
  return {
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders() })
  return res.ok ? res.json() : null
}

async function sbPost(path, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text)
  return JSON.parse(text)
}

async function sbPatch(path, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  })
  return res.ok
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const ownerId = req._user.id

  if (!SB_URL || !SB_KEY) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const { phone, email, fullName, truckId, cdl } = await req.json()

    if (!fullName?.trim()) {
      return Response.json({ error: 'Full name is required' }, { status: 400, headers: corsHeaders(req) })
    }
    if (!phone?.trim()) {
      return Response.json({ error: 'Phone number is required' }, { status: 400, headers: corsHeaders(req) })
    }
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Valid email is required' }, { status: 400, headers: corsHeaders(req) })
    }

    // ── 1. Verify caller is an owner/admin ──────────────────────────────────
    const members = await sbGet(`company_members?user_id=eq.${ownerId}&status=eq.active&select=company_id,role&limit=1`)
    const membership = members?.[0]
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return Response.json({ error: 'Only fleet owners can add drivers' }, { status: 403, headers: corsHeaders(req) })
    }
    const companyId = membership.company_id

    // ── 2. Get company name for SMS ─────────────────────────────────────────
    let companyName = 'your fleet'
    try {
      const companies = await sbGet(`companies?id=eq.${companyId}&select=name&limit=1`)
      if (companies?.[0]?.name) companyName = companies[0].name
    } catch {}

    // ── 3. Create Supabase auth user (temp password, driver resets on login) ─
    const tempPassword = Math.random().toString(36).slice(2, 10) + 'Q1!'  // meets complexity
    let newUserId
    try {
      const createRes = await fetch(`${SB_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { ...sbHeaders(), 'apikey': SB_KEY },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          password: tempPassword,
          email_confirm: true,   // skip email verification
          user_metadata: { full_name: fullName.trim(), role: 'driver' },
        }),
      })
      const userData = await createRes.json()
      if (!createRes.ok) {
        // User may already exist — try to look them up
        if (userData.msg?.includes('already') || userData.error?.includes('already')) {
          const existing = await sbGet(`profiles?email=eq.${email.toLowerCase().trim()}&select=id&limit=1`)
          if (existing?.[0]?.id) {
            newUserId = existing[0].id
          } else {
            return Response.json({ error: 'Email already registered' }, { status: 409, headers: corsHeaders(req) })
          }
        } else {
          return Response.json({ error: userData.msg || userData.error || 'Failed to create account' }, { status: 500, headers: corsHeaders(req) })
        }
      } else {
        newUserId = userData.id
      }
    } catch (err) {
      return Response.json({ error: `Auth error: ${err.message}` }, { status: 500, headers: corsHeaders(req) })
    }

    // ── 4. Upsert profiles row for the new driver ───────────────────────────
    const profileData = {
      id: newUserId,
      role: 'driver',
      full_name: fullName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      assigned_truck_id: truckId || null,
      ...(cdl ? { cdl_number: cdl.trim() } : {}),
      subscription_plan: 'driver',
    }
    try {
      await fetch(`${SB_URL}/rest/v1/profiles`, {
        method: 'POST',
        headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(profileData),
      })
    } catch {}

    // ── 5. Add to company_members ───────────────────────────────────────────
    try {
      await sbPost('company_members', {
        company_id: companyId,
        user_id: newUserId,
        role: 'driver',
        status: 'active',
        invited_by: ownerId,
      })
    } catch (err) {
      // Ignore unique constraint violation (member already exists)
      if (!err.message?.includes('duplicate') && !err.message?.includes('unique')) {
        console.error('company_members insert error:', err.message)
      }
    }

    // ── 6. Mark vehicle as assigned if truckId provided ────────────────────
    if (truckId) {
      try {
        await sbPatch(`vehicles?id=eq.${truckId}&owner_id=eq.${ownerId}`, {
          driver_id: newUserId,   // may not exist — update only if column present
          status: 'available',
        })
      } catch {}
    }

    // ── 7. Send SMS via Twilio ──────────────────────────────────────────────
    const downloadUrl = 'https://qivori.com/download'
    const smsBody = `${companyName} added you as a driver on Q — the AI dispatch app. Download at ${downloadUrl} and sign in with:\nEmail: ${email}\nTemp password: ${tempPassword}\nChange your password after first login.`

    const smsResult = await sendSMS(phone, smsBody)
    if (!smsResult.ok) {
      // Don't fail the whole request — driver was created, SMS is best-effort
      console.error('SMS send failed:', smsResult.error)
    }

    // ── 8. Return the new driver profile ───────────────────────────────────
    return Response.json({
      success: true,
      smsSent: smsResult.ok,
      driver: {
        id: newUserId,
        full_name: fullName.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        assigned_truck_id: truckId || null,
        role: 'driver',
        status: 'available',
      },
    }, { headers: corsHeaders(req) })

  } catch (err) {
    console.error('invite-driver-sms error:', err)
    return Response.json({ error: err.message || 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
