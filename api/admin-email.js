import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { sendEmail, logEmail } from './_lib/emails.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Auth check — must be logged in
  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  // Check admin email or admin role via profile lookup
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@qivori.com'
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  let isAdmin = user.email === adminEmail || user.email?.endsWith('@qivori.com')

  if (!isAdmin && supabaseUrl && serviceKey) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=role`, {
        headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
      })
      const data = await res.json()
      if (data?.[0]?.role === 'admin') isAdmin = true
    } catch (e) { /* ignore */ }
  }

  if (!isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403, headers: corsHeaders(req) })
  }

  try {
    const { to, subject, html, replyTo } = await req.json()
    if (!to || !subject || !html) {
      return Response.json({ error: 'to, subject, and html are required' }, { status: 400, headers: corsHeaders(req) })
    }

    const recipients = Array.isArray(to) ? to : [to]
    if (recipients.length === 0) {
      return Response.json({ error: 'No recipients provided' }, { status: 400, headers: corsHeaders(req) })
    }
    if (recipients.length > 500) {
      return Response.json({ error: 'Maximum 500 recipients per batch' }, { status: 400, headers: corsHeaders(req) })
    }

    // Wrap content in Qivori branded template
    const brandedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;">
<span style="font-size:32px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
<span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
</div>
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:32px 24px;margin-bottom:24px;">
${html}
</div>
<div style="text-align:center;padding-top:16px;">
<p style="color:#555;font-size:11px;margin:0;">Qivori AI - AI-Powered TMS for Trucking</p>
<p style="color:#555;font-size:11px;margin:4px 0 0;">Questions? Reply to this email - hello@qivori.com</p>
</div></div></body></html>`

    let sent = 0
    let failed = 0

    // Send emails (sequentially to avoid rate limits)
    for (const email of recipients) {
      try {
        const result = await sendEmail(email, subject, brandedHtml)
        if (result.ok) {
          sent++
          // Log to email_logs
          await logEmail(null, email, 'admin_broadcast', { subject, sent_by: user.email })
        } else {
          failed++
        }
      } catch (e) {
        failed++
      }
    }

    return Response.json({ sent, failed }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
