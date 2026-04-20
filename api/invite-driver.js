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

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const { email, role, driver_id } = await req.json()
    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400, headers: corsHeaders(req) })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return Response.json({ error: 'Invalid email format' }, { status: 400, headers: corsHeaders(req) })
    }

    const inviteRole = ['driver', 'dispatcher', 'admin'].includes(role) ? role : 'driver'

    // Check that the requesting user is an owner or admin
    const memberRes = await fetch(
      `${supabaseUrl}/rest/v1/company_members?user_id=eq.${userId}&status=eq.active&select=id,company_id,role`,
      {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Accept': 'application/json',
        },
      }
    )

    if (!memberRes.ok) {
      return Response.json({ error: 'Failed to verify membership' }, { status: 500, headers: corsHeaders(req) })
    }

    const members = await memberRes.json()
    const membership = members?.[0]

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return Response.json({ error: 'Only owners and admins can invite users' }, { status: 403, headers: corsHeaders(req) })
    }

    const companyId = membership.company_id

    // Generate unique token
    const token = crypto.randomUUID()

    // Insert invitation
    const invRes = await fetch(`${supabaseUrl}/rest/v1/invitations`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        company_id: companyId,
        email,
        role: inviteRole,
        driver_id: driver_id || null,
        token,
        invited_by: userId,
      }),
    })

    if (!invRes.ok) {
      const err = await invRes.text()
      return Response.json({ error: 'Failed to create invitation' }, { status: 500, headers: corsHeaders(req) })
    }

    const invitation = (await invRes.json())?.[0]

    // Get company name for the email
    let companyName = 'your company'
    try {
      const compRes = await fetch(
        `${supabaseUrl}/rest/v1/companies?user_id=eq.${userId}&select=name&limit=1`,
        {
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Accept': 'application/json',
          },
        }
      )
      if (compRes.ok) {
        const companies = await compRes.json()
        if (companies?.[0]?.name) companyName = companies[0].name
      }
    } catch {}

    // Also try profiles table for company name
    if (companyName === 'your company') {
      try {
        const profRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=company_name,full_name`,
          {
            headers: {
              'apikey': supabaseServiceKey,
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Accept': 'application/json',
            },
          }
        )
        if (profRes.ok) {
          const profiles = await profRes.json()
          if (profiles?.[0]?.company_name) companyName = profiles[0].company_name
        }
      } catch {}
    }

    // Send invitation email via Resend
    if (resendKey) {
      const inviteUrl = inviteRole === 'driver'
        ? `https://qivori.com/?view=onboard&token=${token}`
        : `https://qivori.com/?view=invite&token=${token}`
      const roleName = inviteRole.charAt(0).toUpperCase() + inviteRole.slice(1)

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">

    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:32px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
      <span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
    </div>

    <div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:32px 24px;margin-bottom:24px;">
      <h1 style="color:#fff;font-size:22px;margin:0 0 8px;font-weight:800;">You're invited to join ${companyName}</h1>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;margin:0 0 24px;">
        You've been invited as a <strong style="color:#f0a500;">${roleName}</strong> on Qivori AI — the smartest TMS for trucking.
      </p>

      <div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="font-size:12px;color:#f0a500;font-weight:700;letter-spacing:1px;margin-bottom:12px;">COMPLETE YOUR ONBOARDING</div>
        <div style="margin-bottom:10px;display:flex;align-items:flex-start;">
          <span style="color:#f0a500;margin-right:8px;">&#x1F4CB;</span>
          <span style="color:#c8c8d0;font-size:13px;"><strong style="color:#fff;">Personal info & CDL</strong> — takes about 5 minutes</span>
        </div>
        <div style="margin-bottom:10px;display:flex;align-items:flex-start;">
          <span style="color:#f0a500;margin-right:8px;">&#x270D;&#xFE0F;</span>
          <span style="color:#c8c8d0;font-size:13px;"><strong style="color:#fff;">Drug & alcohol consent</strong> — DOT-required, sign right from your phone</span>
        </div>
        <div style="display:flex;align-items:flex-start;">
          <span style="color:#f0a500;margin-right:8px;">&#x2705;</span>
          <span style="color:#c8c8d0;font-size:13px;"><strong style="color:#fff;">Emergency contact</strong> — one form, you're done</span>
        </div>
      </div>

      <div style="text-align:center;">
        <a href="${inviteUrl}" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Start Onboarding</a>
      </div>

      <p style="color:#555;font-size:11px;text-align:center;margin:16px 0 0;">This invitation expires in 7 days.</p>
    </div>

    <div style="text-align:center;padding-top:16px;">
      <p style="color:#555;font-size:11px;margin:0;">Qivori AI - AI-Powered TMS for Trucking</p>
    </div>
  </div>
</body>
</html>`

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Qivori AI <hello@qivori.com>',
            reply_to: 'qivori@sheamjan.resend.app',
            to: [email],
            subject: `You're invited to join ${companyName} on Qivori`,
            html,
          }),
        })
      } catch {}
    }

    return Response.json({
      success: true,
      invitation: {
        id: invitation?.id,
        email,
        role: inviteRole,
        token,
        expires_at: invitation?.expires_at,
      },
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
