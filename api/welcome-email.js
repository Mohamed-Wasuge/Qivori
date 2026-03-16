import { handleCors, corsHeaders } from './_lib/auth.js'

export const config = { runtime: 'edge' }

// Rate limiting to prevent email spam
const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX = 3 // max 3 welcome emails per minute per IP

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

  // Rate limit
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: corsHeaders(req) })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return Response.json({ error: 'RESEND_API_KEY not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const { email, fullName, role } = await req.json()
    if (!email) return Response.json({ error: 'Email is required' }, { status: 400, headers: corsHeaders(req) })

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return Response.json({ error: 'Invalid email format' }, { status: 400, headers: corsHeaders(req) })
    }

    const firstName = String(fullName || 'Driver').split(' ')[0].replace(/[<>"'&]/g, '').substring(0, 50)
    const isCarrier = role === 'carrier'

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
      <h1 style="color:#fff;font-size:22px;margin:0 0 8px;font-weight:800;">Welcome aboard, ${firstName}!</h1>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Your Qivori AI account is ready. ${isCarrier
          ? "You've got an AI co-pilot that handles dispatch, invoicing, compliance, and more — all from your phone."
          : "You're set up to manage loads, carriers, and payments with AI-powered tools."}
      </p>

      <div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="font-size:12px;color:#f0a500;font-weight:700;letter-spacing:1px;margin-bottom:12px;">HERE'S WHAT YOU CAN DO</div>
        ${isCarrier ? `
        <div style="margin-bottom:10px;display:flex;align-items:flex-start;">
          <span style="color:#f0a500;margin-right:8px;">&#x1F4E6;</span>
          <span style="color:#c8c8d0;font-size:13px;"><strong style="color:#fff;">Find &amp; book loads</strong> — search the load board and book with one tap</span>
        </div>
        <div style="margin-bottom:10px;display:flex;align-items:flex-start;">
          <span style="color:#f0a500;margin-right:8px;">&#x1F9FE;</span>
          <span style="color:#c8c8d0;font-size:13px;"><strong style="color:#fff;">Send invoices</strong> — snap your BOL, and we'll email the invoice to your broker</span>
        </div>
        <div style="margin-bottom:10px;display:flex;align-items:flex-start;">
          <span style="color:#f0a500;margin-right:8px;">&#x26FD;</span>
          <span style="color:#c8c8d0;font-size:13px;"><strong style="color:#fff;">IFTA auto-calc</strong> — state mileage is calculated from your delivered loads</span>
        </div>
        <div style="display:flex;align-items:flex-start;">
          <span style="color:#f0a500;margin-right:8px;">&#x1F4AC;</span>
          <span style="color:#c8c8d0;font-size:13px;"><strong style="color:#fff;">AI chat</strong> — just tell Qivori what you need, like talking to a dispatcher</span>
        </div>
        ` : `
        <div style="margin-bottom:10px;display:flex;align-items:flex-start;">
          <span style="color:#f0a500;margin-right:8px;">&#x1F4CB;</span>
          <span style="color:#c8c8d0;font-size:13px;"><strong style="color:#fff;">Post loads</strong> — list loads for carriers to find and book</span>
        </div>
        <div style="margin-bottom:10px;display:flex;align-items:flex-start;">
          <span style="color:#f0a500;margin-right:8px;">&#x1F69B;</span>
          <span style="color:#c8c8d0;font-size:13px;"><strong style="color:#fff;">Manage carriers</strong> — track assignments, compliance, and payments</span>
        </div>
        <div style="display:flex;align-items:flex-start;">
          <span style="color:#f0a500;margin-right:8px;">&#x1F4B0;</span>
          <span style="color:#c8c8d0;font-size:13px;"><strong style="color:#fff;">Payments</strong> — invoice and pay carriers with full audit trail</span>
        </div>
        `}
      </div>

      <div style="text-align:center;">
        <a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Open Qivori AI</a>
      </div>
    </div>

    <div style="background:#16161e;border:1px solid #2a2a35;border-radius:12px;padding:16px 20px;text-align:center;margin-bottom:24px;">
      <span style="color:#22c55e;font-size:13px;font-weight:700;">&#x2713; 14-day free trial</span>
      <span style="color:#8a8a9a;font-size:13px;"> — no credit card required to start</span>
    </div>

    <div style="background:#16161e;border:1px solid #2a2a35;border-radius:12px;padding:20px;margin-bottom:24px;">
      <div style="font-size:12px;color:#f0a500;font-weight:700;letter-spacing:1px;margin-bottom:10px;">&#x1F381; REFER & EARN</div>
      <p style="color:#c8c8d0;font-size:13px;line-height:1.6;margin:0 0 12px;">
        Know other drivers? Share your referral link and you <strong style="color:#fff;">both get a free month</strong> when they sign up.
      </p>
      <div style="text-align:center;">
        <a href="https://qivori.com" style="display:inline-block;background:#1e1e2a;color:#f0a500;font-weight:700;font-size:12px;padding:10px 24px;border-radius:8px;text-decoration:none;border:1px solid #f0a50030;">Find Your Referral Link in the App</a>
      </div>
    </div>

    <div style="text-align:center;padding-top:16px;">
      <p style="color:#555;font-size:11px;margin:0;">Qivori AI - AI-Powered TMS for Trucking</p>
      <p style="color:#555;font-size:11px;margin:4px 0 0;">Questions? Reply to this email or contact hello@qivori.com</p>
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
        to: [email],
        subject: `Welcome to Qivori AI, ${firstName}!`,
        html,
      }),
    })

    if (!res.ok) {
      return Response.json({ error: 'Failed to send welcome email' }, { status: 502, headers: corsHeaders(req) })
    }

    return Response.json({ success: true }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
