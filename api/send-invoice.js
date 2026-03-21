import { handleCors, corsHeaders, verifyAuth, requireActiveSubscription } from './_lib/auth.js'
import { checkRateLimit, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }
  const subErr = await requireActiveSubscription(req, user)
  if (subErr) return subErr

  // Rate limit: 10 requests per 60 seconds per user (Supabase-backed)
  const { limited, resetSeconds } = await checkRateLimit(user.id, 'send-invoice', 10, 60)
  if (limited) return rateLimitResponse(req, corsHeaders, resetSeconds)

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return Response.json({ error: 'RESEND_API_KEY not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const { to, carrierName, invoiceNumber, loadNumber, route, amount, dueDate, brokerName } = await req.json()

    if (!to) return Response.json({ error: 'Recipient email required' }, { status: 400, headers: corsHeaders(req) })

    const safeCarrierName = String(carrierName || 'Carrier').replace(/[<>"'&]/g, '')
    const safeInvoiceNumber = String(invoiceNumber || '—').replace(/[<>"'&]/g, '')
    const safeLoadNumber = String(loadNumber || '—').replace(/[<>"'&]/g, '')
    const safeRoute = String(route || '—').replace(/[<>"'&]/g, '')
    const safeDueDate = String(dueDate || 'Net 30').replace(/[<>"'&]/g, '')
    const safeAmount = Number(amount || 0)

    const subject = `Invoice ${safeInvoiceNumber} — ${safeRoute} — $${safeAmount.toLocaleString()}`

    const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0c14; color: #e8e6e3; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, rgba(240,165,0,0.12), rgba(0,212,170,0.06)); padding: 32px 28px; border-bottom: 1px solid rgba(255,255,255,0.08);">
        <div style="font-size: 22px; font-weight: 800; letter-spacing: 3px; margin-bottom: 4px;">
          QI<span style="color: #f0a500;">VORI</span>
          <span style="font-size: 11px; color: #00d4aa; letter-spacing: 1px; margin-left: 6px;">AI</span>
        </div>
        <div style="font-size: 12px; color: #8a8f98;">Invoice from ${safeCarrierName}</div>
      </div>

      <div style="padding: 28px;">
        <div style="font-size: 11px; font-weight: 700; color: #f0a500; letter-spacing: 2px; margin-bottom: 16px;">INVOICE</div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #8a8f98; border-bottom: 1px solid rgba(255,255,255,0.06);">Invoice #</td>
            <td style="padding: 8px 0; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.06);">${safeInvoiceNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #8a8f98; border-bottom: 1px solid rgba(255,255,255,0.06);">Load #</td>
            <td style="padding: 8px 0; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.06);">${safeLoadNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #8a8f98; border-bottom: 1px solid rgba(255,255,255,0.06);">Route</td>
            <td style="padding: 8px 0; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.06);">${safeRoute}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #8a8f98; border-bottom: 1px solid rgba(255,255,255,0.06);">Carrier</td>
            <td style="padding: 8px 0; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.06);">${safeCarrierName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #8a8f98; border-bottom: 1px solid rgba(255,255,255,0.06);">Due Date</td>
            <td style="padding: 8px 0; font-size: 13px; font-weight: 700; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.06);">${safeDueDate}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; font-size: 15px; font-weight: 700; color: #f0a500;">AMOUNT DUE</td>
            <td style="padding: 12px 0; font-size: 24px; font-weight: 800; text-align: right; color: #f0a500;">$${safeAmount.toLocaleString()}</td>
          </tr>
        </table>

        <div style="background: rgba(240,165,0,0.06); border: 1px solid rgba(240,165,0,0.15); border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
          <div style="font-size: 12px; color: #8a8f98; line-height: 1.6;">
            Please remit payment within the terms agreed upon. For questions regarding this invoice, reply to this email or contact ${safeCarrierName} directly.
          </div>
        </div>

        <div style="font-size: 11px; color: #555; text-align: center; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06);">
          Sent via <span style="color: #f0a500;">Qivori AI</span> — The AI-powered carrier operating system
        </div>
      </div>
    </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'Qivori AI <hello@qivori.com>',
        reply_to: 'qivori@sheamjan.resend.app',
        to: [to],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return Response.json({ error: 'Email failed' }, { status: 502, headers: corsHeaders(req) })
    }

    const data = await res.json()
    return Response.json({ success: true, id: data.id }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
