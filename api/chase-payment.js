import { corsHeaders } from './_lib/auth.js' // eslint-disable-line no-unused-vars

export const config = { runtime: 'edge' }

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY

function json(data, s = 200) {
  return new Response(JSON.stringify(data), { status: s, headers: { 'Content-Type': 'application/json' } })
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return json({ error: 'Unauthorized' }, 401)

  // Verify user
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  const body = await req.json()
  const { loadId, brokerEmail, brokerName, amount, loadNumber } = body

  if (!brokerEmail) return json({ error: 'brokerEmail is required' }, 400)
  if (!amount) return json({ error: 'amount is required' }, 400)

  // Resolve carrier identity — never use Qivori identity for carrier-facing emails
  let carrierName = null
  let carrierEmail = null
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/companies?owner_id=eq.' + user.id + '&select=name,email&limit=1',
      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }
    )
    if (res.ok) {
      const rows = await res.json()
      if (rows[0]) { carrierName = rows[0].name; carrierEmail = rows[0].email }
    }
  } catch {}

  if (!carrierName || !carrierEmail) {
    return json({ error: 'Carrier identity not found. Please complete your company profile.' }, 400)
  }

  if (!RESEND_API_KEY) return json({ error: 'Email service not configured' }, 500)

  const displayAmt = `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const ref = loadNumber ? `Load #${loadNumber}` : (loadId ? `Load ${loadId.slice(0, 8).toUpperCase()}` : 'Your Load')
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #222; background: #f8f8f8; margin: 0; padding: 0; }
  .wrap { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; }
  .header { background: #111; padding: 28px 36px; }
  .header h1 { color: #f5a623; font-size: 22px; margin: 0; letter-spacing: 1px; }
  .header p { color: #999; margin: 6px 0 0; font-size: 13px; }
  .body { padding: 32px 36px; }
  .amount-box { background: #f9f5ec; border: 2px solid #f5a623; border-radius: 8px; padding: 20px 24px; margin: 24px 0; text-align: center; }
  .amount-box .lbl { font-size: 11px; color: #888; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
  .amount-box .amt { font-size: 36px; font-weight: 900; color: #111; margin: 6px 0; }
  .amount-box .ref { font-size: 13px; color: #555; }
  p { color: #444; line-height: 1.7; font-size: 14px; margin: 12px 0; }
  .footer { background: #f2f2f2; padding: 20px 36px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #888; }
  strong { color: #111; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>${carrierName.toUpperCase()}</h1>
    <p>Payment Follow-Up — ${today}</p>
  </div>
  <div class="body">
    <p>Dear ${brokerName || 'Broker'},</p>
    <p>I hope this message finds you well. I'm following up on an outstanding payment for the load detailed below. As of today, the invoice remains unpaid.</p>

    <div class="amount-box">
      <div class="lbl">Amount Due</div>
      <div class="amt">${displayAmt}</div>
      <div class="ref">${ref}</div>
    </div>

    <p>If payment has already been sent, please disregard this message and let me know the confirmation number so I can update my records. If there are any issues with the invoice or documentation, please reply to this email and I'll resolve them promptly.</p>

    <p>To avoid any delays, I kindly request payment be issued within <strong>5 business days</strong>. Please reply directly to this email to confirm receipt and your expected payment date.</p>

    <p>Thank you for your business. I look forward to hearing from you.</p>

    <p>Best regards,<br/>
    <strong>${carrierName}</strong><br/>
    ${carrierEmail}</p>
  </div>
  <div class="footer">
    This is a professional payment follow-up from ${carrierName}. Please reply to ${carrierEmail} for any questions.
  </div>
</div>
</body>
</html>
`

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${carrierName} <${carrierEmail}>`,
      reply_to: carrierEmail,
      to: [brokerEmail],
      subject: `Payment Follow-Up: ${displayAmt} Due — ${ref}`,
      html,
    }),
  })

  if (!emailRes.ok) {
    const err = await emailRes.text()
    console.error('[chase-payment] Resend error:', err)
    return json({ error: 'Failed to send email' }, 500)
  }

  // Log the chase attempt on the load record (best-effort)
  if (loadId) {
    try {
      await fetch(SUPABASE_URL + '/rest/v1/loads?id=eq.' + loadId, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ payment_chased_at: new Date().toISOString() }),
      })
    } catch {}
  }

  return json({ ok: true, sent: true })
}
