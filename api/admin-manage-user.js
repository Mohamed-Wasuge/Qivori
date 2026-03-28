import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
import { checkRateLimit, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders() {
  return {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const { limited, resetSeconds } = await checkRateLimit(req._user.id, 'admin-manage', 10, 60)
  if (limited) return rateLimitResponse(req, corsHeaders, resetSeconds)
  const adminUser = req._user

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  // Verify caller is admin
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${adminUser.id}&select=role`,
    { headers: sbHeaders() }
  )
  const profiles = await profileRes.json()
  if (!profiles?.[0] || profiles[0].role !== 'admin') {
    return Response.json({ error: 'Admin access required' }, { status: 403, headers: corsHeaders(req) })
  }

  try {
    const { action, userId } = await req.json()

    if (!userId) {
      return Response.json({ error: 'userId required' }, { status: 400, headers: corsHeaders(req) })
    }

    // Prevent self-delete
    if (userId === adminUser.id) {
      return Response.json({ error: 'Cannot modify your own account' }, { status: 400, headers: corsHeaders(req) })
    }

    if (action === 'suspend') {
      // Update profile status to suspended
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: 'suspended', updated_at: new Date().toISOString() }),
      })
      return Response.json({ success: true, action: 'suspended' }, { headers: corsHeaders(req) })
    }

    if (action === 'activate') {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: 'active', updated_at: new Date().toISOString() }),
      })
      return Response.json({ success: true, action: 'activated' }, { headers: corsHeaders(req) })
    }

    if (action === 'remove') {
      // 1. Delete all user data from owned tables
      const tables = ['loads', 'invoices', 'expenses', 'drivers', 'vehicles', 'documents', 'companies', 'carrier_settings', 'compliance_checks', 'audit_logs', 'dispatch_decisions', 'check_calls', 'platform_settings']
      for (const table of tables) {
        await fetch(`${SUPABASE_URL}/rest/v1/${table}?owner_id=eq.${userId}`, {
          method: 'DELETE',
          headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
        }).catch(() => {})
      }

      // 2. Delete profile
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'DELETE',
        headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      })

      // 3. Delete auth user via Supabase Admin API
      const deleteRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: sbHeaders(),
      })

      if (!deleteRes.ok) {
        const err = await deleteRes.text()
        return Response.json({ success: false, error: `Auth delete failed: ${err}` }, { headers: corsHeaders(req) })
      }

      return Response.json({ success: true, action: 'removed' }, { headers: corsHeaders(req) })
    }

    return Response.json({ error: 'Invalid action. Use: suspend, activate, remove' }, { status: 400, headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message || 'Failed' }, { status: 500, headers: corsHeaders(req) })
  }
}
