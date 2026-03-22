import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  const userId = req._user.id
  const userEmail = req._user.email

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  const svcHeaders = {
    'apikey': supabaseServiceKey,
    'Authorization': `Bearer ${supabaseServiceKey}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }

  try {
    const { token } = await req.json()
    if (!token) {
      return Response.json({ error: 'Token is required' }, { status: 400, headers: corsHeaders(req) })
    }

    // Look up invitation by token
    const invRes = await fetch(
      `${supabaseUrl}/rest/v1/invitations?token=eq.${token}&select=*`,
      { headers: svcHeaders }
    )

    if (!invRes.ok) {
      return Response.json({ error: 'Failed to look up invitation' }, { status: 500, headers: corsHeaders(req) })
    }

    const invitations = await invRes.json()
    const invitation = invitations?.[0]

    if (!invitation) {
      return Response.json({ error: 'Invalid invitation token' }, { status: 404, headers: corsHeaders(req) })
    }

    if (invitation.accepted_at) {
      return Response.json({ error: 'Invitation already accepted' }, { status: 400, headers: corsHeaders(req) })
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return Response.json({ error: 'Invitation has expired' }, { status: 400, headers: corsHeaders(req) })
    }

    // Check if user already has a company_members record for this company
    const existRes = await fetch(
      `${supabaseUrl}/rest/v1/company_members?company_id=eq.${invitation.company_id}&user_id=eq.${userId}&select=id`,
      { headers: svcHeaders }
    )
    if (existRes.ok) {
      const existing = await existRes.json()
      if (existing?.length > 0) {
        // Already a member — just mark invitation as accepted
        await fetch(
          `${supabaseUrl}/rest/v1/invitations?id=eq.${invitation.id}`,
          {
            method: 'PATCH',
            headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ accepted_at: new Date().toISOString() }),
          }
        )
        return Response.json({ success: true, message: 'Already a member of this company' }, { headers: corsHeaders(req) })
      }
    }

    // Create company_members row
    const memberRes = await fetch(`${supabaseUrl}/rest/v1/company_members`, {
      method: 'POST',
      headers: { ...svcHeaders, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        company_id: invitation.company_id,
        user_id: userId,
        role: invitation.role || 'driver',
        driver_id: invitation.driver_id || null,
        invited_by: invitation.invited_by,
        status: 'active',
      }),
    })

    if (!memberRes.ok) {
      const errText = await memberRes.text()
      return Response.json({ error: 'Failed to create membership' }, { status: 500, headers: corsHeaders(req) })
    }

    // Update profiles.company_id and profiles.role
    await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          company_id: invitation.company_id,
          role: 'carrier',  // keep as carrier for app routing, company_members.role handles permissions
        }),
      }
    )

    // If driver_id is set, link the driver record's user_id to this user
    if (invitation.driver_id) {
      await fetch(
        `${supabaseUrl}/rest/v1/drivers?id=eq.${invitation.driver_id}`,
        {
          method: 'PATCH',
          headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ user_id: userId }),
        }
      )
    }

    // Mark invitation as accepted
    await fetch(
      `${supabaseUrl}/rest/v1/invitations?id=eq.${invitation.id}`,
      {
        method: 'PATCH',
        headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ accepted_at: new Date().toISOString() }),
      }
    )

    // Get company name for response
    let companyName = ''
    try {
      const profRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${invitation.invited_by}&select=company_name`,
        { headers: svcHeaders }
      )
      if (profRes.ok) {
        const profiles = await profRes.json()
        companyName = profiles?.[0]?.company_name || ''
      }
    } catch {}

    return Response.json({
      success: true,
      companyName,
      role: invitation.role || 'driver',
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
