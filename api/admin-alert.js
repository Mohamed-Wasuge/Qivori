import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Admin-only or system calls with service key
  const { user } = await verifyAuth(req)
  const svcKey = process.env.SUPABASE_SERVICE_KEY
  const isServiceKey = svcKey && req.headers.get('x-service-key') === svcKey

  if (!user && !isServiceKey) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const ip = getClientIP(req)
  const { limited, resetMs } = rateLimit(`alert:${ip}`, 10, 60000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  try {
    const { type, title, message, severity, source, userId } = await req.json()
    if (!title || !message) {
      return Response.json({ error: 'title and message required' }, { status: 400, headers: corsHeaders(req) })
    }

    const results = { email: false, sms: false, db: false }

    // 1. Save to Supabase notifications table
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY
    if (supabaseUrl && serviceKey) {
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            title,
            body: `[${severity || 'info'}] ${source ? `[${source}] ` : ''}${message}`,
            user_id: userId || user?.id || 'system',
            read: false,
            created_at: new Date().toISOString(),
          }),
        })
        results.db = res.ok
      } catch {}
    }

    // 2. Send email to admin
    const resendKey = process.env.RESEND_API_KEY
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@qivori.com'
    if (resendKey) {
      try {
        const severityEmoji = severity === 'critical' ? '🔴' : severity === 'warning' ? '🟡' : '🟢'
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Qivori AI <hello@qivori.com>',
            to: adminEmail,
            subject: `${severityEmoji} Qivori Alert: ${title}`,
            html: `
              <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="padding: 20px; background: #0d0d0d; border-radius: 12px; border: 1px solid #222;">
                  <div style="font-size: 22px; font-weight: 800; letter-spacing: 3px; margin-bottom: 16px; color: #fff;">
                    QI<span style="color: #f0a500;">VORI</span> <span style="font-size: 12px; color: #00d4aa;">AI AGENT</span>
                  </div>
                  <div style="background: ${severity === 'critical' ? '#2d1111' : severity === 'warning' ? '#2d2211' : '#112d11'}; border: 1px solid ${severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f0a500' : '#22c55e'}; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                    <div style="font-size: 16px; font-weight: 700; color: ${severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f0a500' : '#22c55e'}; margin-bottom: 8px;">
                      ${severityEmoji} ${title}
                    </div>
                    <div style="font-size: 14px; color: #ccc; line-height: 1.6;">${message}</div>
                  </div>
                  <div style="font-size: 11px; color: #666; text-align: center;">
                    Sent by Qivori AI Agent · ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}
                  </div>
                </div>
              </div>
            `,
          }),
        })
        results.email = res.ok
      } catch {}
    }

    // 3. Send SMS if critical
    if (severity === 'critical') {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID
      const twilioToken = process.env.TWILIO_AUTH_TOKEN
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER
      const adminPhone = process.env.ADMIN_PHONE
      if (twilioSid && twilioToken && twilioPhone && adminPhone) {
        try {
          const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: adminPhone,
              From: twilioPhone,
              Body: `🔴 QIVORI ALERT: ${title}\n${message}`,
            }).toString(),
          })
          results.sms = res.ok
        } catch {}
      }
    }

    return Response.json({ success: true, results }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Alert failed' }, { status: 500, headers: corsHeaders(req) })
  }
}
