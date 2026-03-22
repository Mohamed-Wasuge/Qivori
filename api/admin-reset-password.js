import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    })
  }

  // Require authenticated admin
  const authErr = await requireAuth(req)
  if (authErr) return authErr

  const adminUser = req._user
  // Verify admin role
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${adminUser.id}&select=role`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  )
  const profiles = await profileRes.json()
  if (!profiles?.[0] || profiles[0].role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    })
  }

  try {
    const { userId, email, action } = await req.json()

    if (!userId && !email) {
      return new Response(JSON.stringify({ error: 'userId or email required' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
      })
    }

    // Action: send_reset_link — sends a password reset email to the user
    if (action === 'send_reset_link') {
      // Use Supabase Admin API to generate a recovery link
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'recovery',
          email: email,
          options: {
            redirect_to: 'https://qivori.com/#/reset-password',
          },
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        return new Response(JSON.stringify({ error: data.msg || data.error || 'Failed to generate reset link' }), {
          status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
        })
      }

      const resetLink = data.action_link

      // Send email via Resend with the reset link
      if (RESEND_API_KEY && resetLink) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Qivori <noreply@qivori.com>',
            to: [email],
            subject: 'Reset Your Qivori Password',
            html: `
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #0a0a0e; color: #fff; border-radius: 16px; overflow: hidden;">
                <div style="padding: 32px 24px; text-align: center;">
                  <div style="font-size: 32px; font-weight: 800; letter-spacing: 3px; color: #f0a500; margin-bottom: 8px;">QIVORI</div>
                  <div style="font-size: 12px; color: #8a8a9a; margin-bottom: 24px;">Password Reset</div>
                  <div style="font-size: 14px; color: #ccc; line-height: 1.6; margin-bottom: 24px;">
                    We received a request to reset your password. Click the button below to set a new password.
                  </div>
                  <a href="${resetLink}" style="display: inline-block; padding: 14px 40px; background: #f0a500; color: #000; font-weight: 700; font-size: 14px; text-decoration: none; border-radius: 10px; margin-bottom: 24px;">
                    Reset Password
                  </a>
                  <div style="font-size: 11px; color: #666; margin-top: 16px;">
                    This link expires in 24 hours. If you didn't request this, you can safely ignore this email.
                  </div>
                </div>
              </div>
            `,
          }),
        })
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Password reset link sent to ${email}`,
        linkGenerated: !!resetLink,
        emailSent: !!RESEND_API_KEY,
      }), {
        status: 200, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
      })
    }

    // Action: force_reset — admin sets a new password directly
    if (action === 'force_reset') {
      const { newPassword } = await req.json().catch(() => ({}))

      if (!newPassword || newPassword.length < 6) {
        return new Response(JSON.stringify({ error: 'Password must be at least 6 characters' }), {
          status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
        })
      }

      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      })

      if (!res.ok) {
        const data = await res.json()
        return new Response(JSON.stringify({ error: data.msg || 'Failed to reset password' }), {
          status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Password updated for user ${userId}`,
      }), {
        status: 200, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use send_reset_link or force_reset' }), {
      status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    })
  }
}
