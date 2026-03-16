import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  // Rate limit: 5 referrals per minute per IP
  const ip = getClientIP(req)
  const { limited, resetMs } = rateLimit(`referral:${ip}`, 5, 60000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return Response.json({ error: 'RESEND_API_KEY not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const { to, referralCode, referralLink } = await req.json()
    if (!to) return Response.json({ error: 'Recipient email is required' }, { status: 400, headers: corsHeaders(req) })

    const safeReferralCode = String(referralCode || '').replace(/[<>"'&]/g, '')
    const safeReferralLink = (referralLink || 'https://qivori.com').replace(/[<>"']/g, '')

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
      <h1 style="color:#fff;font-size:22px;margin:0 0 8px;font-weight:800;">A fellow driver invited you to Qivori AI</h1>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;margin:0 0 24px;">
        One of your fellow truckers thinks you'd love Qivori AI — the AI-powered TMS that handles dispatch, invoicing, IFTA, and compliance from your phone. And when you sign up, you both get a free month.
      </p>

      <div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="font-size:12px;color:#f0a500;font-weight:700;letter-spacing:1px;margin-bottom:12px;">WHAT YOU GET</div>
        <div style="margin-bottom:8px;color:#c8c8d0;font-size:13px;">&#x2705; AI dispatcher that works 24/7</div>
        <div style="margin-bottom:8px;color:#c8c8d0;font-size:13px;">&#x2705; One-tap load booking &amp; invoicing</div>
        <div style="margin-bottom:8px;color:#c8c8d0;font-size:13px;">&#x2705; Auto IFTA calculation for all 50 states</div>
        <div style="margin-bottom:8px;color:#c8c8d0;font-size:13px;">&#x2705; 14-day free trial — no credit card needed</div>
        <div style="color:#22c55e;font-size:13px;font-weight:700;">&#x1F381; Plus a FREE month when you subscribe!</div>
      </div>

      <div style="text-align:center;">
        <a href="${safeReferralLink}" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">
          Join Qivori AI Free
        </a>
      </div>

      ${safeReferralCode ? `<div style="text-align:center;margin-top:16px;"><span style="color:#555;font-size:11px;">Referral code: <strong style="color:#f0a500;">${safeReferralCode}</strong></span></div>` : ''}
    </div>

    <div style="text-align:center;padding-top:16px;">
      <p style="color:#555;font-size:11px;margin:0;">Qivori AI - AI-Powered TMS for Trucking</p>
    </div>
  </div>
</body>
</html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Qivori AI <hello@qivori.com>',
        reply_to: 'qivori@sheamjan.resend.app',
        to: [to],
        subject: 'A fellow driver invited you to Qivori AI — get a free month!',
        html,
      }),
    })

    if (!res.ok) {
      return Response.json({ error: 'Failed to send referral email' }, { status: 502, headers: corsHeaders(req) })
    }

    return Response.json({ success: true }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
